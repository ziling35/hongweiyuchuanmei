#!/usr/bin/env node
// 校验插件包内容变化是否都伴随 manifest 版本提升。
//
// 背景：后端启动时会用镜像里内置的 *.yingce-plugin 覆盖插件登记表。若同一版本号的包内容
// 变了（sha256 不同），bootstrapBuiltInPlugins 会拒绝安装并让整个服务启动失败：
//   "请求插件 <id>@<version> 已安装，但包摘要不同；请发布新版本"
// 因此凡是被打进包的文件（manifest.json / README.md / docs / assets / web / backend / LICENSE）
// 有改动，就必须同时 bump manifest.json 的 version。
//
// 用法：
//   node plugin-packages/check-version-bumps.mjs                     # 对比 origin/main..HEAD
//   node plugin-packages/check-version-bumps.mjs --base <ref>        # 指定基线
//   node plugin-packages/check-version-bumps.mjs --base <ref> --head <ref>

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packaged = ["manifest.json", "README.md", "LICENSE"];
const packagedDirs = ["docs/", "assets/", "web/", "backend/"];
// 内置插件（随镜像发布）与自建插件（后台导入，不进镜像）用同一套版本纪律。
const packageRoots = ["plugin-packages", "custom-plugins"];

function parseArgs(argv) {
  const options = { base: "origin/main", head: "HEAD" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base" || arg === "--head") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} 缺少取值`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("usage: check-version-bumps.mjs [--base <ref>] [--head <ref>]");
      process.exit(0);
    }
    throw new Error(`未知参数：${arg}`);
  }
  return options;
}

function git(args, input) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "buffer",
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} 失败：${result.stderr.toString().trim()}`);
  return result.stdout;
}

function resolveRef(ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function isPackaged(relative) {
  return packaged.includes(relative) || packagedDirs.some((prefix) => relative.startsWith(prefix));
}

/** @returns {Map<string, {version: string|null, files: Map<string, string>}>} */
function snapshot(ref) {
  const packages = new Map();
  for (const rootName of packageRoots) {
    for (const line of git(["ls-tree", "-r", ref, "--", rootName]).toString().split("\n")) {
      if (!line) continue;
      const tab = line.indexOf("\t");
      const blob = line.slice(0, tab).split(/\s+/)[2];
      const path = line.slice(tab + 1);
      if (!path.startsWith(`${rootName}/`)) continue;
      const rest = path.slice(rootName.length + 1);
      const slash = rest.indexOf("/");
      if (slash < 0) {
        // 包文件 <root>/<id>.yingce-plugin：字节变了就相当于换了交付物
        const suffix = ".yingce-plugin";
        if (!rest.endsWith(suffix)) continue;
        const id = rest.slice(0, -suffix.length);
        const key = `${rootName}/${id}`;
        const record = packages.get(key) ?? { directory: id, version: null, files: new Map(), package: null };
        record.package = blob;
        packages.set(key, record);
        continue;
      }
      const directory = rest.slice(0, slash);
      const relative = rest.slice(slash + 1);
      if (!isPackaged(relative)) continue;
      const key = `${rootName}/${directory}`;
      if (!packages.has(key)) packages.set(key, { directory, version: null, files: new Map(), package: null });
      packages.get(key).files.set(relative, blob);
    }
  }

  for (const record of packages.values()) {
    const blob = record.files.get("manifest.json");
    if (!blob) continue;
    const output = git(["cat-file", "blob", blob]).toString("utf8");
    try {
      const manifest = JSON.parse(output);
      // 只统计"目录名 == manifest id"的正式来源；src-* 之类的辅助副本不参与发行。
      record.version = manifest.version ?? null;
      record.id = manifest.id ?? null;
    } catch {
      record.version = null;
      record.id = null;
    }
  }

  for (const [key, record] of [...packages]) {
    if (record.id && record.id !== record.directory) packages.delete(key);
  }
  return packages;
}

const options = parseArgs(process.argv.slice(2));
const base = resolveRef(options.base);
const head = resolveRef(options.head);
if (!base) {
  console.error(`✗ 找不到基线 ${options.base}：先 git fetch，或用 --base 指定部署过的提交。`);
  process.exit(2);
}
if (!head) {
  console.error(`✗ 找不到目标 ${options.head}。`);
  process.exit(2);
}

const before = snapshot(base);
const after = snapshot(head);

const violations = [];
for (const [key, record] of after) {
  const previous = before.get(key);
  if (!previous) continue;
  const changed = [...new Set([...previous.files.keys(), ...record.files.keys()])]
    .filter((path) => previous.files.get(path) !== record.files.get(path))
    .sort();
  const packageChanged = previous.package !== record.package;
  if (!changed.length && !packageChanged) continue;
  if (previous.version !== record.version) continue;
  violations.push({ key, version: record.version, changed, packageChanged });
}

if (!violations.length) {
  console.log(`✓ 插件包版本检查通过（${options.base}..${options.head}，${after.size} 个插件）`);
  process.exit(0);
}

console.error("✗ 以下插件的内容有变化，但 manifest.json 的 version 没变：");
for (const { key, version, changed, packageChanged } of violations) {
  const details = [];
  if (changed.length) details.push(`源码/文档：${changed.slice(0, 6).join(", ")}${changed.length > 6 ? " …" : ""}`);
  if (packageChanged) details.push("包文件 .yingce-plugin 字节变化");
  console.error(`  ${key}  v${version ?? "?"}  ${details.join("；")}`);
}
console.error("\n修复步骤：");
console.error("  1. bump <root>/<id>/manifest.json 的 version（内容变了就换号，例如 1.0.0 -> 1.0.1）");
console.error("  2. 重新生成文档与包：内置插件用 sh plugin-packages/build-packages.sh --protocol <id>；自建插件用 node custom-plugins/build.mjs <id>");
console.error("  3. 提交 manifest.json / README.md / docs/ / <id>.yingce-plugin");
console.error("不改版本就发布或导入，已部署实例会因“包摘要不同”失败：镜像内置插件是后端启动失败，自建插件是导入被拒。");
process.exit(1);
