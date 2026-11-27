# Fork 维护手册

本手册只适用于 `ziling35/hongweiyuchuanmei` 这个 fork，说明如何在跟随上游的同时维护自己的改动、构建自己的镜像并更新自己的服务器。上游文档（[在线更新与安全回退](docs/content/docs/backend/system-update.mdx)）仍描述官方 GHCR 与官方更新器，两者不要混用。

发版、服务器更新、新机器部署、主题（皮肤）迁移和线上排查的具体命令见 [FORK_DEPLOY_RUNBOOK.md](FORK_DEPLOY_RUNBOOK.md)。

## 1. 分支模型

| 分支 | 作用 | 规则 |
| --- | --- | --- |
| `hw` | 自定义分支（仓库默认分支） | 承载所有自定义改动，部署镜像从这里构建 |
| `main` | 上游镜像 | 只允许快进到 `upstream/main`，不放任何本地提交 |

`main` 保持纯净是这套模型的关键：同步永远不会产生冲突，也随时能看出自己落后上游多少个提交。所有冲突只发生在 `hw` 上。

仓库的默认分支设为 `hw`：Dependabot 只读取默认分支上的 `.github/dependabot.yml`，而该文件已在 `hw` 中移除，因此不会再自动开依赖升级 PR；同时默认分支与部署分支一致，PR 基线和分支保护提示也落在真正使用的分支上。

一次性初始化：

```bash
git remote add upstream https://github.com/ddcat-ai/open-ai-canvas.git
git fetch upstream
git checkout -b hw
```

## 2. 同步上游

```bash
./scripts/sync-upstream.sh
```

脚本依次执行：检查工作区干净 → 拉取 `upstream/main` → 快进 `main` → 推送 `main` → 合并进 `hw` → 推送 `hw`。

- 冲突时脚本会停下并列出冲突文件，解决后 `git add -A && git commit`，再手动推送 `hw`
- `NO_PUSH=1` 只改本地不推送
- `CUSTOM_BRANCH=xxx` 换自定义分支名

## 3. 构建镜像

`.github/workflows/publish-images.yml` 已增加 `hw` 分支触发，push 到 `hw` 会自动构建并推送：

```
ghcr.io/ziling35/open-ai-canvas-backend
ghcr.io/ziling35/open-ai-canvas-web
ghcr.io/ziling35/open-ai-canvas-yingce-agent
```

镜像名固定为 `open-ai-canvas-*`，与仓库名 `hongweiyuchuanmei` 无关。

标签规则：

| 触发 | 产出标签 |
| --- | --- |
| push 到 `hw` 或 `main` | `sha-<完整commit>`、`sha-<7位>` |
| push 版本 tag `v*` | 上述 + 具体版本标签 |
| `main` 且仍是最新提交 | 额外更新 `latest` |

`hw` 分支的构建**不会**更新 `latest`，也不会写版本标签——这是 `promote-image.sh` 的既定行为，部署时固定用 `sha-<commit>` 或你自己打的版本标签。

打自己的版本标签前必须同时满足两个条件，否则 `prepare` 阶段直接失败：

1. `VERSION` 文件内容与 tag 名完全一致（例如 `v1.8.6-hw.1`）
2. `CHANGELOG.md` 中存在 `## v1.8.6-hw.1` 这一行标题

## 4. GHCR 权限

仓库现在是公开状态，三个包随之公开。**服务器不需要 `docker login` 就能拉**，验证方式：

```bash
curl -sS "https://ghcr.io/token?service=ghcr.io&scope=repository:ziling35/open-ai-canvas-backend:pull"
# 返回体里带 "token" 就说明包是公开的；返回 denied 则需要下面两种处理之一
```

拉不动时（401 / denied）二选一：把三个包在 GitHub → Packages 里改成 public，或者登录：

```bash
echo '<PAT，至少 read:packages>' | docker login ghcr.io -u ziling35 --password-stdin
```

国内机器直连 `ghcr.io` 偏慢，可用南大镜像（实测可匿名代理本仓库三个包）：

```bash
docker pull ghcr.nju.edu.cn/ziling35/open-ai-canvas-web:sha-<完整commit>
```

脚本的拉取前缀和 digest 校验都用 `IMAGE_REPOSITORY`，换镜像站要整段替换：

```bash
IMAGE_REPOSITORY=ghcr.nju.edu.cn/ziling35/open-ai-canvas ./scripts/update-server.sh --dry-run
```

注意：`ubuntu-24.04-arm` runner 只对公开仓库开放。仓库一旦转为私有，arm64 构建会失败，需要去掉 arm64 矩阵项或改用自建 runner。

## 5. 服务器首次安装

安装脚本的三个默认值都指向官方仓库，全部用环境变量覆盖：

```bash
curl -fsSL https://raw.githubusercontent.com/ziling35/hongweiyuchuanmei/hw/scripts/install-server-image.sh \
| sudo env \
    IMAGE_REPOSITORY=ghcr.io/ziling35/open-ai-canvas \
    CANVAS_IMAGE_TAG=sha-<完整commit> \
    COMPOSE_URL=https://raw.githubusercontent.com/ziling35/hongweiyuchuanmei/hw/docker-compose.deploy.yml \
    UPDATER_INSTALL_URL=https://raw.githubusercontent.com/ziling35/hongweiyuchuanmei/hw/scripts/install-host-updater.sh \
    bash
```

`IMAGE_REPOSITORY` 同时决定拉取地址和 digest 校验的前缀，必须与工作流推送的仓库一致。

更新器要从本 fork 的 Release 下载二进制：

```bash
curl -fsSL https://raw.githubusercontent.com/ziling35/hongweiyuchuanmei/hw/scripts/install-host-updater.sh \
| sudo env REPOSITORY=ziling35/hongweiyuchuanmei bash
```

## 6. 服务器日常更新

```bash
cd /opt/open-ai-canvas
IMAGE_REPOSITORY=ghcr.io/ziling35/open-ai-canvas ./scripts/update-server-image.sh sha-<完整commit> --dry-run   # 只看会改什么
IMAGE_REPOSITORY=ghcr.io/ziling35/open-ai-canvas ./scripts/update-server-image.sh sha-<完整commit>
```

脚本行为：拉取三个镜像 → 解析仓库 digest → 备份 `.env` 和 PostgreSQL → 把 `CANVAS_IMAGE_TAG` 与三个 `CANVAS_*_IMAGE` 固定为 digest → `run --rm migrate` → `up -d` → 轮询 `/api/health/ready`。

- 迁移失败会恢复 `.env` 并保持旧版本运行（迁移整批在事务内回滚）
- 健康检查失败不会自动回退，只打印回退命令，需要人工确认
- `SKIP_DB_BACKUP=1` 跳过数据库备份，仅在已有其他备份时使用

回退：

```bash
cp backups/env-<时间戳>.bak .env
docker compose --env-file .env -f docker-compose.deploy.yml up -d --pull never
```

已经执行过新迁移时，还要还原数据库：

```bash
docker compose --env-file .env -f docker-compose.deploy.yml exec -T postgres \
  sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/db-<时间戳>.dump
```

### 一键更新脚本

`scripts/update-server.sh` 会自动查出 `hw` 上最近一次**构建成功**的提交，拼成 `sha-<完整commit>` 再交给 `update-server-image.sh`，不用自己翻 Actions 找 SHA：

```bash
./scripts/update-server.sh --check      # 只对比当前版本和最新版本，不做修改
./scripts/update-server.sh --dry-run    # 走完拉取和 digest 解析，不写文件不重启
./scripts/update-server.sh              # 更新到最新一次构建成功的镜像
./scripts/update-server.sh --rollback   # 回退到最近一次更新前的 .env（不含数据库还原）
```

不用先 clone 也能跑：

```bash
curl -fsSL https://raw.githubusercontent.com/ziling35/hongweiyuchuanmei/hw/scripts/update-server.sh \
  | sudo bash -s -- --check
```

- 部署目录自动探测（同时含 `.env` 和 `docker-compose.deploy.yml`），也可用 `DEPLOY_DIR=` 指定
- 当前标签已等于目标标签时直接退出，改 `FORCE=1` 才强制重跑
- 匿名调用 GitHub API 有 60 次/小时限制；触发限流时设 `GITHUB_TOKEN`（需 `actions:read`），或直接用 `./scripts/update-server.sh sha-<完整commit>` 跳过查询
- 镜像不可见时优先用 `GHCR_TOKEN` 自动登录 ghcr.io，否则打印登录或改包可见性的步骤
- `--rollback` 只还原 `.env` 并 `up -d --pull never`，数据库还原仍需手工执行上面的命令

## 7. 冲突纪律

1. `VERSION` 和 `CHANGELOG.md` 只在打版本 tag 的那次提交里修改；同步冲突时直接取上游内容，再重新 bump
2. 不要修改已存在的数据库迁移文件（按名称 + checksum 校验，改动会导致 `migrate-schema up` 失败），需要改 schema 就新增迁移
3. 不要修改 `.github/workflows/quality.yml` 里 job 的 `name`，发布流程靠这些检查名判定是否放行
4. 能做成插件的定制就做成插件（参考现有 `.yingce-plugin` 包），不改核心代码，这类改动永远不会和上游冲突；自建的定制插件放 `custom-plugins/`（不进镜像，后台导入），不要放进 `plugin-packages/`，见第 9 节
5. 上游和 fork 同时占用了同一个迁移版本号时，不许改上游那条迁移：把 fork 的迁移改成下一个空号（并同步 `CurrentSchemaVersion`），再在 `MigrateSchema` 里加一条账本归一化，把旧号记录改写成新号（参考 `normalizeForkShowcaseMigration`），否则已有数据库升级时会被名称/校验和校验拒绝启动
6. 改插件包内容必须 bump 版本：`plugin-packages/<id>/` 下会被打进 `.yingce-plugin` 的文件（`manifest.json`、`README.md`、`docs/`、`assets/`、`web/`、`backend/`、`LICENSE`）只要发生变化，就要同时提升 `manifest.json` 的 `version` 并重新生成包。同版本不同摘要会让已部署实例升级时后端拒绝启动（`pluginRuntimeErr`，日志为「请求插件 <id>@<version> 已安装，但包摘要不同；请发布新版本」）。推送前 `node plugin-packages/check-version-bumps.mjs` 会拦截这类改动，`scripts/verify-before-push.mjs` 已接入该检查
7. 重新生成包的标准做法：`node plugin-packages/embed-documentation.mjs <id>` 刷新 README/docs 里的 manifest 契约，再打包成 `<id>.yingce-plugin`；提交时把 `manifest.json`、`README.md`、`docs/`、`<id>.yingce-plugin` 一起带上，不能只改源码目录

## 8. 与官方更新器的关系

Host Updater 会把 `.env` 里的 `CANVAS_*_IMAGE` 改回它认为的目标版本并重启容器。如果服务器使用本 fork 的镜像，要么只走第 6 节的手动更新，要么确认更新器的来源与目标版本也指向本 fork 的 Release，不要让两套机制同时决定镜像版本。

## 9. 插件分层：内置 vs 自建

| 目录 | 是否进镜像 | 改完怎么生效 |
| --- | --- | --- |
| `plugin-packages/` | 是（`backend/Dockerfile` 的 `COPY plugin-packages`） | 必须重新构建镜像、发版，再跑服务器更新脚本；同版本改内容会让后端启动失败（第 7 节第 6 条） |
| `custom-plugins/` | 否（`.dockerignore` 已排除） | `node custom-plugins/build.mjs <id>` 重新打包，管理后台 → 插件 → 导入上传，不重启、不发版 |

约定：

1. 自己维护的协议插件默认放 `custom-plugins/`，不要放进 `plugin-packages/`——内置插件改一次就要发一次镜像，还会因为摘要不一致把升级卡住
2. 两个目录共用同一套版本纪律，`node plugin-packages/check-version-bumps.mjs` 会同时检查
3. 插件从 `plugin-packages/` 移到 `custom-plugins/` 后，已部署实例不受影响（登记表和缓存的包都在数据卷 `/data` 里），但**新机器首次部署不再自带该插件**，需要在后台导入一次
4. 完整流程见 [custom-plugins/README.md](custom-plugins/README.md)
