#!/usr/bin/env bash
# 服务器一键更新：自动解析本 fork 最近一次构建成功的 sha-<commit> 标签，
# 再交给 update-server-image.sh 完成拉取、digest 固定、备份、迁移、重启和健康检查。
#
# 用法（在部署目录或任意目录执行）：
#   ./scripts/update-server.sh              # 更新到 hw 最新一次构建成功的镜像
#   ./scripts/update-server.sh --check      # 只对比当前版本和最新版本，不做任何修改
#   ./scripts/update-server.sh --dry-run    # 走完拉取和 digest 解析，不写文件不重启
#   ./scripts/update-server.sh --rollback   # 回退到最近一次更新前的 .env（不含数据库还原）
#   ./scripts/update-server.sh sha-abc1234  # 指定标签，跳过自动解析
#
# 不用先 clone 也能跑：
#   curl -fsSL https://raw.githubusercontent.com/ziling35/hongweiyuchuanmei/hw/scripts/update-server.sh \
#     | sudo bash -s -- --check
#
# 可覆盖的变量：
#   REPOSITORY        默认 ziling35/hongweiyuchuanmei
#   BRANCH            默认 hw
#   IMAGE_REPOSITORY  默认 ghcr.io/ziling35/open-ai-canvas
#   DEPLOY_DIR        默认自动探测同时含 .env 和 COMPOSE_FILE 的目录
#   COMPOSE_FILE      默认 docker-compose.deploy.yml
#   GHCR_TOKEN        提供后自动 docker login ghcr.io（需要 read:packages）
#   GHCR_USER         默认取 REPOSITORY 的 owner
#   GITHUB_TOKEN      私有仓库或规避匿名限流时使用
#   FORCE=1           当前标签已等于目标标签时仍然重跑
#   CONFIRM=1         回退时跳过交互确认

set -Eeuo pipefail

REPOSITORY="${REPOSITORY:-ziling35/hongweiyuchuanmei}"
BRANCH="${BRANCH:-hw}"
WORKFLOW="${WORKFLOW:-publish-images.yml}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-ghcr.io/ziling35/open-ai-canvas}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.deploy.yml}"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/$REPOSITORY/$BRANCH}"

MODE="update"
TARGET_TAG=""
EXTRA_ARGS=()

step() { printf '\n==> %s\n' "$1"; }
info() { printf '    %s\n' "$1"; }
fail() { printf '\n操作中止：%s\n' "$1" >&2; exit 1; }

for argument in "$@"; do
    case "$argument" in
        --check) MODE="check" ;;
        --dry-run) EXTRA_ARGS+=("--dry-run") ;;
        --rollback) MODE="rollback" ;;
        -h|--help) sed -n '2,28p' "${BASH_SOURCE[0]:-/dev/stdin}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*) fail "未知参数：$argument（支持 --check / --dry-run / --rollback）" ;;
        *) TARGET_TAG="$argument" ;;
    esac
done

for command in curl docker grep; do
    command -v "$command" >/dev/null 2>&1 || fail "缺少命令：$command"
done

detect_deploy_dir() {
    local candidate
    for candidate in "${DEPLOY_DIR:-}" "$PWD" /opt/open-ai-canvas /srv/open-ai-canvas "${HOME:-/root}/open-ai-canvas"; do
        [[ -n "$candidate" ]] || continue
        if [[ -f "$candidate/.env" && -f "$candidate/$COMPOSE_FILE" ]]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    return 1
}

DEPLOY_DIR="$(detect_deploy_dir)" ||
    fail "没有找到同时含 .env 和 $COMPOSE_FILE 的目录，请用 DEPLOY_DIR=/opt/open-ai-canvas 指定"
DEPLOY_DIR="$(cd "$DEPLOY_DIR" && pwd)"

env_value() { sed -n "s/^$1=//p" "$DEPLOY_DIR/.env" | tail -n 1; }

compose() { docker compose --env-file .env -f "$COMPOSE_FILE" "$@"; }

rollback() {
    local latest answer
    latest="$(ls -1t "$DEPLOY_DIR"/backups/env-*.bak 2>/dev/null | head -n 1 || true)"
    [[ -n "$latest" ]] || fail "没有找到 $DEPLOY_DIR/backups/env-*.bak，无法自动回退"

    step "回退到 $(basename "$latest")"
    info "目标标签：$(sed -n 's/^CANVAS_IMAGE_TAG=//p' "$latest" | tail -n 1)"
    info "当前标签：$(env_value CANVAS_IMAGE_TAG)"

    if [[ "${CONFIRM:-0}" != "1" ]]; then
        read -r -p '确认用该备份覆盖 .env 并重启？输入 yes 继续：' answer
        [[ "$answer" == "yes" ]] || fail "已取消，未做任何修改"
    fi

    cp "$latest" "$DEPLOY_DIR/.env"
    cd "$DEPLOY_DIR"
    compose up -d --pull never
    printf '\n已按 %s 重启。若那次更新已执行过新迁移，还需要手动还原数据库：\n' "$latest"
    printf '  docker compose --env-file .env -f %s exec -T postgres \\\n' "$COMPOSE_FILE"
    printf "    sh -c 'pg_restore --clean --if-exists -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"' < backups/db-<时间戳>.dump\n"
}

latest_ready_sha() {
    local url http_code body sha
    url="https://api.github.com/repos/$REPOSITORY/actions/workflows/$WORKFLOW/runs"
    url="$url?branch=$BRANCH&status=success&per_page=1"

    local curl_args=(-sS --proto '=https' --max-time 20 -w '\n%{http_code}'
        -H 'Accept: application/vnd.github+json')
    [[ -n "${GITHUB_TOKEN:-}" ]] && curl_args+=(-H "Authorization: Bearer $GITHUB_TOKEN")

    # 正文和状态码分开取，才能把匿名限流、仓库不可见、无构建记录区分开。
    body="$(curl "${curl_args[@]}" "$url")" ||
        fail "连不上 api.github.com，请检查服务器出网和 DNS"
    http_code="${body##*$'\n'}"
    body="${body%$'\n'*}"

    case "$http_code" in
        200) ;;
        403)
            if [[ "$body" == *"rate limit"* ]]; then
                fail "GitHub API 匿名限流（60 次/小时）已用尽，带 token 重试：
  GITHUB_TOKEN=<PAT，需 actions:read> ./scripts/update-server.sh
也可以跳过查询，直接指定标签：./scripts/update-server.sh sha-<完整commit>"
            fi
            fail "GitHub API 拒绝访问（403）：$body"
            ;;
        404) fail "仓库 $REPOSITORY 不可见（404），确认已公开，或设置 GITHUB_TOKEN" ;;
        *) fail "GitHub API 返回 HTTP $http_code：$body" ;;
    esac

    sha="$(printf '%s' "$body" |
        grep -o '"head_sha"[[:space:]]*:[[:space:]]*"[0-9a-f]\{40\}"' |
        head -n 1 | grep -o '[0-9a-f]\{40\}')"
    [[ -n "$sha" ]] ||
        fail "$REPOSITORY 的 $BRANCH 分支还没有 $WORKFLOW 构建成功的记录；等到一次成功运行，或直接传标签"
    printf '%s\n' "$sha"
}

if [[ "$MODE" == "rollback" ]]; then
    rollback
    exit 0
fi

if [[ -z "$TARGET_TAG" ]]; then
    step "查询 $BRANCH 分支最近一次构建成功"
    TARGET_TAG="sha-$(latest_ready_sha)"
    info "目标标签：$TARGET_TAG"
else
    [[ "$TARGET_TAG" != "latest" ]] || fail "生产部署不能用 latest，请用 sha-<commit> 或明确的版本标签"
    info "使用指定标签：$TARGET_TAG"
fi

CURRENT_TAG="$(env_value CANVAS_IMAGE_TAG)"

step "版本对比"
info "部署目录：$DEPLOY_DIR"
info "当前标签：${CURRENT_TAG:-未知}"
info "目标标签：$TARGET_TAG"

if [[ "$MODE" == "check" ]]; then
    if [[ "$CURRENT_TAG" == "$TARGET_TAG" ]]; then
        printf '\n已是最新版本，无需更新。\n'
    else
        printf '\n有新版本可更新。执行不带 --check 的命令即可更新。\n'
    fi
    exit 0
fi

if [[ "$CURRENT_TAG" == "$TARGET_TAG" && "${FORCE:-0}" != "1" ]]; then
    printf '\n当前已是 %s，未做任何修改（要强制重跑设 FORCE=1）。\n' "$TARGET_TAG"
    exit 0
fi

step "检查镜像可拉取"
if ! docker manifest inspect "$IMAGE_REPOSITORY-backend:$TARGET_TAG" >/dev/null 2>&1; then
    if [[ -n "${GHCR_TOKEN:-}" ]]; then
        info "使用 GHCR_TOKEN 登录 ghcr.io"
        printf '%s' "$GHCR_TOKEN" |
            docker login ghcr.io -u "${GHCR_USER:-${REPOSITORY%%/*}}" --password-stdin >/dev/null ||
            fail "docker login ghcr.io 失败，请确认 GHCR_TOKEN 含 read:packages 权限且未过期"
    elif grep -q 'ghcr.io' "${HOME:-/root}/.docker/config.json" 2>/dev/null; then
        info "已登录 ghcr.io，继续"
    else
        fail "无法访问 $IMAGE_REPOSITORY-backend:$TARGET_TAG。多为镜像不可见，两种解法：
  1) 服务器执行 docker login ghcr.io -u ${REPOSITORY%%/*} --password-stdin（PAT 至少 read:packages），或
  2) 在 GitHub → Packages 把三个 open-ai-canvas-* 包改成 public"
    fi

    docker manifest inspect "$IMAGE_REPOSITORY-backend:$TARGET_TAG" >/dev/null 2>&1 ||
        fail "登录后仍无法访问 $TARGET_TAG，确认该提交的 Build 步骤确实推送成功"
fi

DEPLOY_SCRIPT="$DEPLOY_DIR/scripts/update-server-image.sh"
if [[ ! -f "$DEPLOY_SCRIPT" ]]; then
    step "下载 update-server-image.sh"
    mkdir -p "$DEPLOY_DIR/scripts"
    curl -fsSL --proto '=https' "$RAW_BASE/scripts/update-server-image.sh" -o "$DEPLOY_SCRIPT" ||
        fail "无法从 $RAW_BASE 下载 update-server-image.sh"
    chmod +x "$DEPLOY_SCRIPT"
    info "已保存 $DEPLOY_SCRIPT"
fi

step "交给 update-server-image.sh 执行更新"
cd "$DEPLOY_DIR"
exec env \
    IMAGE_REPOSITORY="$IMAGE_REPOSITORY" \
    COMPOSE_FILE="$COMPOSE_FILE" \
    DEPLOY_DIR="$DEPLOY_DIR" \
    bash "$DEPLOY_SCRIPT" "$TARGET_TAG" ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
