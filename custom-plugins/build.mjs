#!/usr/bin/env node
// 打包自建插件：刷新 README/docs 里的 manifest 契约，再生成 <id>.yingce-plugin。
//
// 用法（在仓库根目录）：
//   node custom-plugins/build.mjs <id> ...   # 打包指定插件
//   node custom-plugins/build.mjs --all      # 打包 custom-plugins/ 下所有插件
//
// 产物用于在管理后台「插件 → 导入」上传，不参与镜像构建：
// backend/Dockerfile 只 COPY plugin-packages，custom-plugins 不会被内置。

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const packageRoot = here;

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw new Error(`${command} 无法执行：${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 失败：\n${result.stdout ?? ""}${result.stderr ?? ""}`.trim());
  }
  return `${result.stdout ?? ""}`.trim();
}

function pythonCommand() {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error("找不到 python3 / python：scripts/package-plugin.py 需要 Python 3。");
}

function pluginIDs() {
  return readdirSync(packageRoot)
    .filter((entry) => {
      const directory = join(packageRoot, entry);
      if (!statSync(directory).isDirectory()) return false;
      try {
        statSync(join(directory, "manifest.json"));
        return true;
      } catch {
        return false;
      }
    })
    .sort();
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node custom-plugins/build.mjs <id> ... | --all");
  process.exit(2);
}
const targets = args.includes("--all") ? pluginIDs() : args.filter((value) => !value.startsWith("-"));
const known = new Set(pluginIDs());
const unknown = targets.filter((id) => !known.has(id));
if (unknown.length) {
  console.error(`✗ custom-plugins/ 下没有这些插件：${unknown.join(", ")}`);
  console.error(`  现有：${[...known].join(", ")}`);
  process.exit(2);
}

const python = pythonCommand();
for (const id of targets) {
  console.log(`\n==> ${id}`);
  run("node", ["plugin-packages/embed-documentation.mjs", id], { PLUGIN_PACKAGE_ROOT: packageRoot });
  const output = run(python, [join("scripts", "package-plugin.py"), "custom-plugins", id]);
  console.log(output);
}

console.log(
  `\n共 ${targets.length} 个插件已打包。上传方式：管理后台 → 插件 → 导入插件，选择 custom-plugins/<id>.yingce-plugin。` +
    `\n这些包不进镜像；改完重新打包并导入即可，不需要重建镜像。`,
);
