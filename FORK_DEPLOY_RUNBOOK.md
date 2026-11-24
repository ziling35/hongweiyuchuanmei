# Fork 部署运维手册

本文件是 `FORK_MAINTENANCE.md` 的实操补充：把「发版到服务器、新机器首次部署、迁移外观主题、排查线上旧页面」这四件事的命令固定下来，避免每次重新推导。

约定：

- `TAG=sha-<完整commit>`，例如本次发布 `sha-2ca22356e2996157855dc44a5d59538f5ac73308`
- `IMAGE_REPOSITORY=ghcr.io/ziling35/open-ai-canvas`
- 部署目录（示例）`/www/wwwroot/<站点>`，容器名前缀 = 部署目录名（Compose 项目名），如目录 `ai.liehaotech.com` 对应 `ailiehaotechcom-postgres-1`

---

## 1. 发版前：确认镜像标签已产出

推 `hw` 会触发 `Publish container images`（`.github/workflows/publish-images.yml`）。**只有 `Quality checks` 通过后，`publish` 阶段才会生成可部署标签**：

| 阶段产物 | 说明 |
| --- | --- |
| `sha-<full>-multi` / `-amd64` / `-arm64` | `build` 阶段的中间镜像，不可用于部署 |
| `sha-<full>` | `publish` 阶段合并架构后的部署标签 |

不用登 GitHub 也能查（包是 Public 时可匿名查）：

```bash
REPO=ziling35/open-ai-canvas-backend
TAG=sha-<完整sha>
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:$REPO:pull&service=ghcr.io" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Bearer $TOKEN" "https://ghcr.io/v2/$REPO/tags/list" | python3 -c 'import sys,json;print([t for t in json.load(sys.stdin)["tags"] if "TAG" in t])'
```

查不到 `sha-<full>`（只有 `-multi`/`-amd64`）= CI 在 `Quality checks` 挂了，`publish` 被跳过。常见原因：后端分片测试断言过期、前端 `bun run test` 或 Previs E2E 偶发失败（偶发可直接 `Re-run failed jobs`）。

---

## 2. 服务器更新（标准流程）

```bash
cd /www/wwwroot/<站点>
TAG=sha-<完整sha>

# 1) 预演：只打印会改什么，不动任何东西
IMAGE_REPOSITORY=ghcr.io/ziling35/open-ai-canvas \
  ./scripts/update-server-image.sh $TAG --dry-run

# 2) 正式更新：拉三个镜像 → 解析 digest → 备份 .env 与 PostgreSQL →
#    固定 digest → run --rm migrate → up -d → 轮询 /api/health/ready
IMAGE_REPOSITORY=ghcr.io/ziling35/open-ai-canvas \
  ./scripts/update-server-image.sh $TAG
```

脚本会把 `.env` 写成不可变引用，这是预期结果：

```dotenv
CANVAS_IMAGE_TAG=sha-<完整sha>
CANVAS_BACKEND_IMAGE=ghcr.io/ziling35/open-ai-canvas-backend@sha256:...
CANVAS_WEB_IMAGE=ghcr.io/ziling35/open-ai-canvas-web@sha256:...
CANVAS_YINGCE_AGENT_IMAGE=ghcr.io/ziling35/open-ai-canvas-yingce-agent@sha256:...
```

**不要加 `SKIP_DB_BACKUP=1`**：涉及迁移账本的版本没有备份就无法回滚。

### 更新后校验

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
docker compose --env-file .env -f docker-compose.deploy.yml ps

curl -s http://127.0.0.1:3000/api/health | python3 -c \
  'import sys,json;d=json.load(sys.stdin)["data"];print(d["build"]);print(d["schema"])'
```

期望：`commit` 等于目标 sha、`schema.current == schema.expected`（本次为 111）、`ready: true`。

### 回滚

```bash
cd /www/wwwroot/<站点>
cp backups/env-<时间戳>.bak .env
docker compose --env-file .env -f docker-compose.deploy.yml up -d --pull never

# 若迁移已执行，还需还原数据库
docker compose --env-file .env -f docker-compose.deploy.yml exec -T postgres \
  sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/db-<时间戳>.dump
```

---

## 3. 慢网 / 国内服务器：镜像搬运

直连 `ghcr.io` 常见只有几十 KB/s。判断方式：`docker pull` 时看层速度，50KB/s 级别就别等了。

### 3.1 从已有镜像的机器搬（最快最稳）

```bash
# 源机器（已跑过该版本）
docker save \
  ghcr.io/ziling35/open-ai-canvas-backend@sha256:<backend digest> \
  ghcr.io/ziling35/open-ai-canvas-web@sha256:<web digest> \
  ghcr.io/ziling35/open-ai-canvas-yingce-agent@sha256:<agent digest> \
  | gzip -1 > /root/canvas-$TAG.tar.gz
ls -lh /root/canvas-$TAG.tar.gz      # 约 400MB
```

```bash
# 目标机器（注意源机 ssh 端口，scp 用大写 -P，rsync 用 -e 'ssh -p'）
apt install -y rsync
cd /root
rsync -avP --partial --inplace -e 'ssh -p <源机端口>' \
  root@<源机IP>:/root/canvas-$TAG.tar.gz ./

gzip -t canvas-$TAG.tar.gz && echo "gzip OK"
docker load -i canvas-$TAG.tar.gz    # 能直接读 gzip
docker images --digests --format '{{.Repository}}  {{.Digest}}' | grep open-ai-canvas
```

digest 必须与源机一致（内容寻址）。之后照第 2 节跑脚本——此时 `docker pull` 只取几 KB 的 manifest，层已在本地，不会再卡。

### 3.2 若脚本的 pull 仍拿不到 manifest

手动跳过 pull（Compose 默认不会重新拉本地已有的镜像）：

```bash
cd /www/wwwroot/<站点>
cp .env backups/env-$(date +%Y%m%d-%H%M%S).bak
# 把 .env 三个 CANVAS_*_IMAGE 改成 name@sha256:...（上一步核对出的 digest），
# CANVAS_IMAGE_TAG 保持 sha-<完整sha>
docker compose --env-file .env -f docker-compose.deploy.yml run --rm migrate
docker compose --env-file .env -f docker-compose.deploy.yml up -d
```

### 3.3 提速手段

```bash
# 提高并发下载数（只影响层并发，不影响单层带宽）
cat > /etc/docker/daemon.json <<'EOF'
{ "max-concurrent-downloads": 10, "max-concurrent-uploads": 5 }
EOF
systemctl restart docker
```

- `registry-mirrors` **只对 `docker.io` 生效，对 `ghcr.io` 无效**。
- 公共 ghcr 前缀（`ghcr.m.daocloud.io` 等）可临时用：`IMAGE_REPOSITORY=ghcr.m.daocloud.io/ziling35/open-ai-canvas`，但要先确认 digest 与官方一致；第三方挂掉会影响回滚。
- 长期方案：自建 pull-through 缓存，把 `IMAGE_REPOSITORY` 指向内网 registry。

```bash
docker run -d --name ghcr-cache --restart=always -p 5000:5000 \
  -e REGISTRY_PROXY_REMOTEURL=https://ghcr.io \
  -e REGISTRY_PROXY_USERNAME=<GitHub 用户名> \
  -e REGISTRY_PROXY_PASSWORD=<PAT，read:packages> \
  -v /data/ghcr-cache:/var/lib/registry registry:2
# 之后用 IMAGE_REPOSITORY=127.0.0.1:5000/ziling35/open-ai-canvas
```

- 同地域同 VPC 的两台机器之间优先用**内网 IP**（`ip -4 addr | grep 'inet 10\.'` 之类），不计公网流量且快很多。

---

## 4. 新服务器首次部署

```bash
curl -fsSL https://raw.githubusercontent.com/ziling35/hongweiyuchuanmei/hw/scripts/install-server-image.sh \
| sudo env \
    IMAGE_REPOSITORY=ghcr.io/ziling35/open-ai-canvas \
    CANVAS_IMAGE_TAG=sha-<完整sha> \
    COMPOSE_URL=https://raw.githubusercontent.com/ziling35/hongweiyuchuanmei/hw/docker-compose.deploy.yml \
    UPDATER_INSTALL_URL=https://raw.githubusercontent.com/ziling35/hongweiyuchuanmei/hw/scripts/install-host-updater.sh \
    bash
```

要点：

- `IMAGE_REPOSITORY` 同时决定拉取地址与 digest 校验前缀，必须与实际推送仓库一致。
- 装完检查 `.env` 必填项：`POSTGRES_DB/USER/PASSWORD`、`DATABASE_URL`、`CANVAS_HTTP_PORT`、`CANVAS_IMAGE_TAG`、三个 `CANVAS_*_IMAGE`、`YINGCE_AGENT_TOKEN`。其余变量有默认值。
- 首次访问在登录框注册账号，首个账号自动是管理员。
- 生产建议显式 `CANVAS_AUTO_MIGRATE=false`（默认 `true`，靠 Compose 的一次性 `migrate` 服务迁移）；有对外域名时补 `CANVAS_PUBLIC_BASE_URL=https://<域名>`。

### 前置反代（Nginx / 宝塔面板）

```nginx
location ^~ / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;                 # 不要写死域名
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_http_version 1.1;
    proxy_buffering off;                          # Agent 对话 / 生成进度走 SSE，必须关
    proxy_read_timeout 3600s;
}
```

- 站点根目录不要留旧的 `index.html` / `assets/`，否则静态规则可能先命中旧构建。
- 跨机反代记得只放行来源 IP，并注意 3000 端口不要对公网开放。

---

## 5. 外观主题（皮肤）迁移

**背景**：Fork 的主题（红尾鱼 `/` 首页大标题、`灵感大厅 / 作品广场` 切换、主题样式）不是编译进前端的固定内容，而是由数据库 `system_settings.appearance` 里的 `skinId` + `skinThemes` 决定；`skinThemes` 里没有对应 id 时前端回落到 `classic`（标题变成 i18n 默认「和影策聊聊创作想法」，也没有作品广场入口）。

同时注意 `appearance-settings-page.tsx` 的保护逻辑：保存时 `skinId` 不在 `skinThemes` 里会被强制回退到 `classic`，所以**两个字段必须一起写**。

### 5.1 从已生效的环境导出

```bash
# SQLite 本地开发库
bun run -e 'import {Database} from "bun:sqlite";const db=new Database(".local/project-workbench-debug/open_ai_canvas.db",{readonly:true});const r=db.query("select value_json from system_settings where key=?").get("appearance");await Bun.write(".local/cache/appearance-hongweiyu.json",r.value_json);'

# 或 Postgres 部署机
docker exec -i <项目名>-postgres-1 psql -U open_ai_canvas -d open_ai_canvas -tA \
  -c "select value_json from system_settings where key='appearance'" > appearance-hongweiyu.json
```

### 5.2 目标机器合并写入

```bash
cd /www/wwwroot/<站点>
PG=<项目名>-postgres-1        # docker ps --format '{{.Names}}' | grep postgres 确认

# 0) 备份
docker exec -i $PG psql -U open_ai_canvas -d open_ai_canvas -tA \
  -c "select coalesce(value_json,'') from system_settings where key='appearance'" > /root/appearance-backup.json

# 1) 合并（只改 skinId / skinThemes，其他品牌字段保留）
python3 - <<PY
import json, subprocess
new = json.load(open('/www/wwwroot/<站点>/appearance-hongweiyu.json'))
q = ["docker","exec","-i","$PG","psql","-U","open_ai_canvas","-d","open_ai_canvas","-tA",
     "-c","select coalesce(value_json,'') from system_settings where key='appearance'"]
cur = subprocess.run(q, capture_output=True, text=True).stdout.strip()
try:
    data = json.loads(cur) if cur else {}
except json.JSONDecodeError:
    data = {}
data['skinId'] = new['skinId']
data['skinThemes'] = [t for t in data.get('skinThemes', []) if t.get('id') != new['skinId']] + new['skinThemes']
open('/root/appearance-merged.json','w',encoding='utf-8').write(json.dumps(data, ensure_ascii=False))
print("merged:", data['skinId'], [t['id'] for t in data['skinThemes']])
PY

# 2) 写入
docker cp /root/appearance-merged.json $PG:/tmp/appearance-merged.json
docker exec -i $PG psql -U open_ai_canvas -d open_ai_canvas <<'SQL'
\set content `cat /tmp/appearance-merged.json`
INSERT INTO system_settings (key, value_json, updated_by, created_at, updated_at)
VALUES ('appearance', :'content', '', now(), now())
ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now();
SQL

# 3) 确认长度不为 0 再重启
docker exec -i $PG psql -U open_ai_canvas -d open_ai_canvas -tA \
  -c "select length(value_json) from system_settings where key='appearance'"
docker compose --env-file .env -f docker-compose.deploy.yml restart backend
```

⚠️ **坑**：`\set content \`cat ...\`` 里的 `cat` 失败时，`:'content'` 会变成**空串**，psql 照样返回 `INSERT 0 1`，结果写进一条空的 appearance 记录。所以必须先 `docker cp` 成功、`length(value_json)` 校验通过。

### 5.3 验证

```bash
curl -s http://127.0.0.1:3000/api/public/appearance | python3 -c \
  'import sys,json;a=json.load(sys.stdin)["data"]["appearance"];print("skinId=",a.get("skinId"),"active=",(a.get("activeSkin") or {}).get("id"))'
```

期望 `skinId= hongweiyu active= hongweiyu`。然后强刷站点：标题应为「今天，想把什么灵感变成作品？」，灵感大厅标题右侧出现「灵感大厅 / 作品广场」。

### 5.4 后台可视化设置

管理后台 → 设置 → 外观：皮肤下拉里若有「红尾鱼 · 首页」直接选并保存即可；看不到说明 `skinThemes` 里没有这条，走 5.2 的写入。

作品广场入口出现后内容为空是正常的：作品数据来自 `showcase_categories` / `showcase_works`，需要在后台建分类、审核发布作品。

---

## 6. 线上「前端还是旧版」排查

按顺序做，能定位到底是哪一层：

```bash
cd /www/wwwroot/<站点>

# 1) 容器镜像是否已是新 digest
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'

# 2) 后端版本与库结构
curl -s http://127.0.0.1:3000/api/health | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d["build"],d["schema"])'

# 3) 容器自己返回的 bundle
curl -s http://127.0.0.1:3000/ | grep -oE 'assets/index-[A-Za-z0-9._-]+\.js' | head -3

# 4) 域名返回的 bundle（对比 3，不一致说明不是同一个来源）
curl -s https://<域名>/ | grep -oE 'assets/index-[A-Za-z0-9._-]+\.js' | head -3

# 5) 强制访问本机 443，绕过 DNS / CDN / 反代
curl -sk --resolve <域名>:443:127.0.0.1 https://<域名>/ | grep -oE 'assets/index-[A-Za-z0-9._-]+\.js' | head -3
```

结论对照：

| 现象 | 结论 | 处理 |
| --- | --- | --- |
| 3 与 4 的 bundle 不同，5 是新的 | 前面一层（CDN / 反代）缓存或指向了别处 | 清缓存 / 改 DNS / 修反代 |
| `getent hosts <域名>` 的 IP ≠ 本机 `curl -s ifconfig.me` | 域名指向了另一台机器 | 改 A 记录，或在另一台做反代 |
| 容器镜像旧 | 更新没生效 | 重跑第 2 节 |
| 三者一致但页面旧 | 浏览器缓存 | Ctrl+Shift+R / 无痕窗口 |
| 页面新但没有主题效果 | 见第 5 节（皮肤未配置） | 写 appearance |

补充：面板反代若把 `proxy_set_header Host` 写死成某个域名，会影响分享链接与 Host 校验，改成 `$host`；SSE 相关要关 `proxy_buffering`。

---

## 7. 迁移账本（版本号冲突）

Fork 与上游曾同时占用迁移版本 `110`，处理方式：

- 上游 `110 = cloud_agent_history_archives` 保持原号；
- Fork 的 `showcase_works` 让位到 `111`；
- `MigrateSchema` 内的 `normalizeForkShowcaseMigration` 会把老库里「110 = showcase_works / `sha256:showcase-works-v110`」的记录改写成 111 身份，再补跑上游 110；账本里若已存在 111 则拒绝自动改写并中止。

升级后 `/api/health` 应显示 `schema.current=111 / expected=111`。出现「数据库迁移 110 名称不一致」说明该库处于预期之外的中间状态：停止更新，保留 `backups/db-*.dump`，按第 2 节回滚后再排查。

---

## 8. 本地开发环境

```powershell
cd <repo>
.\.local\start-dev.ps1    # CGO 编译后端 + 后台启动 3000/8080，日志在 .local\cache\logs
.\.local\stop-dev.ps1     # 按端口停止
```

Windows 上执行策略若禁止脚本，用 `powershell -ExecutionPolicy Bypass -File .\.local\start-dev.ps1`。仓库自带的 `scripts/start-local.ps1` 会调用 `bun`（`bun.ps1` 被策略拦），更容易失败。
