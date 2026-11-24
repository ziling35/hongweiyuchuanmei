#!/usr/bin/env python3
"""把插件源码目录打成确定性 .yingce-plugin（跨平台，等价于 build-packages.sh 的 zip 逻辑）。

用法：
    python scripts/package-plugin.py <包根目录> <插件ID>
    例：python scripts/package-plugin.py custom-plugins kunrou-images

约定：
- 只打包 manifest.json / README.md / docs / assets / web / backend / LICENSE 中存在的文件；
- 条目按字节序排序、固定时间戳，因此同样的源码永远产出同样的 sha256；
- 输出为 <包根目录>/<插件ID>.yingce-plugin，并在最后做一次回读校验。
"""

import hashlib
import os
import sys
import zipfile

CANDIDATES = ("manifest.json", "README.md", "docs", "assets", "web", "backend", "LICENSE")
FIXED_DATE = (2000, 1, 1, 0, 0, 0)


def collect(package_dir):
    files = []
    for name in CANDIDATES:
        target = os.path.join(package_dir, name)
        if os.path.isfile(target):
            files.append(name)
            continue
        if not os.path.isdir(target):
            continue
        for current, _directories, names in os.walk(target):
            for filename in names:
                full = os.path.join(current, filename)
                files.append(os.path.relpath(full, package_dir).replace(os.sep, "/"))
    return sorted(files, key=lambda value: value.encode())


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__.strip().splitlines()[2].strip())
    root, package_id = sys.argv[1], sys.argv[2]
    package_dir = os.path.join(root, package_id)
    if not os.path.isfile(os.path.join(package_dir, "manifest.json")):
        raise SystemExit(f"{package_dir} 下没有 manifest.json")

    entries = collect(package_dir)
    output = os.path.join(root, f"{package_id}.yingce-plugin")
    temporary = output + ".tmp"
    with zipfile.ZipFile(temporary, "w") as archive:
        for relative in entries:
            info = zipfile.ZipInfo(relative, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o644 << 16
            with open(os.path.join(package_dir, relative), "rb") as handle:
                archive.writestr(info, handle.read(), compresslevel=9)
    os.replace(temporary, output)

    with zipfile.ZipFile(output) as archive:
        for name in archive.namelist():
            if open(os.path.join(package_dir, name), "rb").read() != archive.read(name):
                raise SystemExit(f"回读校验失败：{name}")

    digest = hashlib.sha256(open(output, "rb").read()).hexdigest()
    print(f"{output}")
    print(f"  entries={len(entries)}: {', '.join(entries)}")
    print(f"  sha256={digest}")


if __name__ == "__main__":
    main()
