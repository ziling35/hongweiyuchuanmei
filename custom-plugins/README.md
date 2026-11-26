# custom-plugins（自建插件，不进镜像）

这个目录放**自己维护的协议插件**，与 `plugin-packages/`（随后端镜像内置的官方插件）严格分开。

## 为什么分开

`backend/Dockerfile` 只会 `COPY plugin-packages` 到镜像的 `/app/plugin-packages`，后端启动时把它们当作**内置插件**自举进 `/data/plugin_registry.json`。内置插件一旦在生产上跑起来，就受两条硬约束：

1. 同一版本号的包内容变了，后端会拒绝启动：`请求插件 <id>@<version> 已安装，但包摘要不同；请发布新版本`；
2. 想让线上拿到改动，必须重新构建镜像、重新发版、再跑一次 `update-server-image.sh`。

放在 `custom-plugins/` 的插件不参与镜像构建，改完重新打包，在管理后台**导入**即可，随时可回退，不需要重建镜像。

## 目录内容

| 路径 | 说明 |
| --- | --- |
| `custom-plugins/<id>/manifest.json` | 插件清单（`version` 必须随内容变化而提升） |
| `custom-plugins/<id>/README.md`、`docs/interface.md` | 文档；`embed-documentation.mjs` 会把 manifest 契约写回这里 |
| `custom-plugins/<id>.yingce-plugin` | 打包产物，就是导入时上传的文件 |
| `custom-plugins/build.mjs` | 打包脚本（刷新文档 + 生成 zip + 打印 sha256） |

当前自建插件：`kunrou-images`、`lumlum-video`、`volcengine-ark-seedream-suite`、`minimax-h3-local`。

## 改完怎么发布

```bash
# 1) 改 manifest / 文档，并把 manifest.json 的 version 提升一位（如 1.0.1 -> 1.0.2）

# 2) 重新生成文档与包（Windows / macOS / Linux 都可用，需要 Python 3）
node custom-plugins/build.mjs kunrou-images
#    或一次全部： node custom-plugins/build.mjs --all

# 3) 提交源码 + 产物
git add custom-plugins/kunrou-images custom-plugins/kunrou-images.yingce-plugin

# 4) 管理后台 → 插件 → 导入插件，选择 custom-plugins/kunrou-images.yingce-plugin
```

导入后不需要重启后端；插件登记表（`/data/plugin_registry.json`）里这条记录会变成 `source=upload`，之后升级镜像不会再被覆盖。

## 版本纪律（重要）

导入同样会校验摘要：**同一版本号 + 不同内容会被拒绝**。所以只要改了会打进包的文件（`manifest.json`、`README.md`、`docs/`、`assets/`、`web/`、`backend/`、`LICENSE`），就必须提升 `version`。

推送前的 `node plugin-packages/check-version-bumps.mjs` 同时覆盖 `plugin-packages/` 和 `custom-plugins/`，漏 bump 会被拦下。

## 什么时候该放进 plugin-packages

只有当这个插件要**随镜像一起分发给所有部署**、并且你接受“改它就要重新发版”时，才把它放进 `plugin-packages/`。上游的官方插件在那里，fork 自建的定制默认留在本目录。
