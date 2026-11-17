#!/usr/bin/env bash
# 服务器端更新：按指定镜像标签从自己的镜像仓库拉取 backend / web / yingce-agent，
# 固定为仓库 digest 写入 .env，备份数据库后迁移并重启。
#
# 用法（在部署目录执行）：
#   ./scripts/update-server-image.sh sha-abc1234
#   ./scripts/update-server-image.sh 1.8.6 --dry-run
#
# 可覆盖的变量：
#   IMAGE_REPOSITORY  默认 ghcr.io/ziling35/open-ai-canvas
#   DEPLOY_DIR        默认当前目录
#   COMPOSE_FILE      默认 docker-compose.deploy.yml
#   CANVAS_HTTP_PORT  默认 .env 中的值，回落到 3000
#   SKIP_DB_BACKUP=1  跳过 pg_dump（仅在你已有其他备份时使用）

set -Eeuo pipefail

TARGET_TAG="${1:-}"
DRY_RUN=0
if [[ "${2:-}" == "--dry-run" ]]; then
    DRY_RUN=1
fi

IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-ghcr.io/ziling35/open-ai-canvas}"
DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.deploy.yml}"

step() {
    printf '\n==> %s\n' "$1"
}

fail() {
    printf '\n更新中止：%s\n' "$1" >&2
    exit 1
}

set_env_value() {
    local path="$1"
    local key="$2"
    local value="$3"
    local temporary
    temporary="$(mktemp "${path}.XXXXXX")"
    awk -v key="$key" -v value="$value" '
        BEGIN { updated=0 }
        $0 ~ "^" key "=" { print key "=" value; updated=1; next }
        { print }
        END { if (!updated) print key "=" value }
    ' "$path" >"$temporary"
    chmod --reference="$path" "$temporary"
    mv "$temporary" "$path"
}

env_value() {
    sed -n "s/^$1=//p" "$DEPLOY_DIR/.env" | tail -n 1
}

[[ -n "$TARGET_TAG" ]] || fail "请传入镜像标签，例如：$0 sha-abc1234"
[[ "$TARGET_TAG" != "latest" ]] || fail "生产部署不能用 latest，请固定到 sha-<commit> 或你自己的版本标签"
[[ "$TARGET_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || fail "镜像标签格式无效：$TARGET_TAG"

cd "$DEPLOY_DIR" || fail "无法进入部署目录 $DEPLOY_DIR"
[[ -f .env ]] || fail "$DEPLOY_DIR 下没有 .env"
[[ -f "$COMPOSE_FILE" ]] || fail "$DEPLOY_DIR 下没有 $COMPOSE_FILE"

command -v docker >/dev/null 2>&1 || fail "未安装 docker"

HTTP_PORT="$(env_value CANVAS_HTTP_PORT)"
HTTP_PORT="${HTTP_PORT:-3000}"
PREVIOUS_TAG="$(env_value CANVAS_IMAGE_TAG)"

printf '部署目录：%s\n镜像仓库：%s\n目标标签：%s\n当前版本：%s\n' \
    "$DEPLOY_DIR" "$IMAGE_REPOSITORY" "$TARGET_TAG" "${PREVIOUS_TAG:-未知}"

step "拉取目标镜像"
for name in backend web yingce-agent; do
    docker pull "$IMAGE_REPOSITORY-$name:$TARGET_TAG"
done

step "解析仓库 digest"
declare -A DIGESTS=()
for name in backend web yingce-agent; do
    digest="$(docker image inspect "$IMAGE_REPOSITORY-$name:$TARGET_TAG" \
        --format '{{range .RepoDigests}}{{println .}}{{end}}' |
        awk -v repository="$IMAGE_REPOSITORY-$name" '$0 ~ "^" repository "@sha256:" { print; exit }')"
    [[ "$digest" =~ ^${IMAGE_REPOSITORY//\//\/}-$name@sha256:[a-f0-9]{64}$ ]] ||
        fail "$name 镜像未返回可验证的仓库 digest（请确认已 docker login ghcr.io 且镜像已推送）"
    DIGESTS[$name]="$digest"
    printf '%s\n' "$digest"
done

if ((DRY_RUN)); then
    step "dry-run：以下内容将写入 .env"
    printf 'CANVAS_IMAGE_TAG=%s\n' "$TARGET_TAG"
    printf 'CANVAS_BACKEND_IMAGE=%s\n' "${DIGESTS[backend]}"
    printf 'CANVAS_WEB_IMAGE=%s\n' "${DIGESTS[web]}"
    printf 'CANVAS_YINGCE_AGENT_IMAGE=%s\n' "${DIGESTS[yingce-agent]}"
    printf '\n未修改任何文件，也未重启服务。\n'
    exit 0
fi

BACKUP_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
mkdir -p "$BACKUP_DIR"

step "备份 .env"
cp .env "$BACKUP_DIR/env-$BACKUP_TIMESTAMP.bak"
printf '已保存 %s\n' "$BACKUP_DIR/env-$BACKUP_TIMESTAMP.bak"

if [[ "${SKIP_DB_BACKUP:-0}" != "1" ]]; then
    step "备份 PostgreSQL"
    if [[ -n "$(docker compose --env-file .env -f "$COMPOSE_FILE" ps -q postgres 2>/dev/null)" ]]; then
        docker compose --env-file .env -f "$COMPOSE_FILE" exec -T postgres \
            sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' \
            >"$BACKUP_DIR/db-$BACKUP_TIMESTAMP.dump"
        [[ -s "$BACKUP_DIR/db-$BACKUP_TIMESTAMP.dump" ]] || fail "数据库备份为空，已停止更新"
        printf '已保存 %s（%s）\n' "$BACKUP_DIR/db-$BACKUP_TIMESTAMP.dump" \
            "$(du -h "$BACKUP_DIR/db-$BACKUP_TIMESTAMP.dump" | cut -f1)"
    else
        printf '未发现运行中的 postgres 容器，跳过数据库备份\n'
    fi
fi

step "写入 .env"
set_env_value .env CANVAS_IMAGE_TAG "$TARGET_TAG"
set_env_value .env CANVAS_BACKEND_IMAGE "${DIGESTS[backend]}"
set_env_value .env CANVAS_WEB_IMAGE "${DIGESTS[web]}"
set_env_value .env CANVAS_YINGCE_AGENT_IMAGE "${DIGESTS[yingce-agent]}"

COMPOSE=(docker compose --env-file .env -f "$COMPOSE_FILE")

step "执行数据库迁移"
if ! "${COMPOSE[@]}" run --rm migrate; then
    printf '\n迁移失败，正在恢复 .env（迁移整批在事务内回滚）\n' >&2
    cp "$BACKUP_DIR/env-$BACKUP_TIMESTAMP.bak" .env
    fail "迁移失败，服务仍在旧版本运行；请查看上方的迁移报错"
fi

step "启动目标版本"
"${COMPOSE[@]}" up -d --remove-orphans

step "等待健康检查"
ready=0
for _ in $(seq 1 60); do
    if curl -fsS -m 5 "http://127.0.0.1:$HTTP_PORT/api/health/ready" >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 3
done

if ((ready != 1)); then
    printf '\n健康检查未通过，当前容器状态：\n' >&2
    "${COMPOSE[@]}" ps >&2
    printf '\n需要回退时执行：\n' >&2
    printf '  cp %q .env\n' "$BACKUP_DIR/env-$BACKUP_TIMESTAMP.bak" >&2
    printf '  docker compose --env-file .env -f %s up -d --pull never\n' "$COMPOSE_FILE" >&2
    printf '若本次已执行新迁移，还需还原数据库：\n' >&2
    printf "  docker compose --env-file .env -f %s exec -T postgres sh -c 'pg_restore --clean --if-exists -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"' < %q\n" \
        "$COMPOSE_FILE" "$BACKUP_DIR/db-$BACKUP_TIMESTAMP.dump" >&2
    fail "新版本未能就绪，请按上面的命令回退"
fi

step "更新完成"
curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health/ready" || true
printf '\n版本：%s -> %s\n' "${PREVIOUS_TAG:-未知}" "$TARGET_TAG"
printf '备份：%s\n' "$BACKUP_DIR"
printf '回退命令：cp %q .env && docker compose --env-file .env -f %s up -d --pull never\n' \
    "$BACKUP_DIR/env-$BACKUP_TIMESTAMP.bak" "$COMPOSE_FILE"
