#!/usr/bin/env bash
# 把上游官方仓库同步进 fork：main 只做上游镜像（永远可快进），
# 自己的改动留在自定义分支，冲突只可能出现在自定义分支上。
#
# 用法：
#   ./scripts/sync-upstream.sh              # 同步并推 main，再合并进 hw
#   CUSTOM_BRANCH=mywork ./scripts/sync-upstream.sh
#   NO_PUSH=1 ./scripts/sync-upstream.sh    # 只改本地，不推送

set -Eeuo pipefail

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/ddcat-ai/open-ai-canvas.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
MIRROR_BRANCH="${MIRROR_BRANCH:-main}"
CUSTOM_BRANCH="${CUSTOM_BRANCH:-hw}"
ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"

step() {
    printf '\n==> %s\n' "$1"
}

fail() {
    printf '\n同步中止：%s\n' "$1" >&2
    exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 || fail "请在仓库根目录运行本脚本"

# 未提交的改动会被 checkout 带走，先停下让调用方决定 stash 还是提交。
if [[ -n "$(git status --porcelain)" ]]; then
    fail "工作区有未提交改动，请先提交或用 git stash 暂存后再同步"
fi

if ! git rev-parse --verify --quiet "$CUSTOM_BRANCH" >/dev/null; then
    fail "本地不存在分支 $CUSTOM_BRANCH，请先创建你的自定义分支"
fi

if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    current_upstream_url="$(git remote get-url "$UPSTREAM_REMOTE")"
    [[ "$current_upstream_url" == "$UPSTREAM_URL" ]] || fail "远端 $UPSTREAM_REMOTE 指向 $current_upstream_url，与预期 $UPSTREAM_URL 不一致"
else
    step "添加上游远端 $UPSTREAM_REMOTE"
    git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

step "拉取 $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
git fetch --prune "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

step "快进 $MIRROR_BRANCH 到 $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
git checkout "$MIRROR_BRANCH"
# 镜像分支不允许本地提交，出现分叉说明改动提交错了分支。
git merge --ff-only "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" || fail "$MIRROR_BRANCH 与上游已分叉；请把本地提交移到 $CUSTOM_BRANCH 后再同步"

if [[ "${NO_PUSH:-0}" != "1" ]]; then
    step "推送 $MIRROR_BRANCH 到 $ORIGIN_REMOTE"
    git push "$ORIGIN_REMOTE" "$MIRROR_BRANCH"
fi

step "合并 $MIRROR_BRANCH 到 $CUSTOM_BRANCH"
git checkout "$CUSTOM_BRANCH"
if ! git merge --no-edit "$MIRROR_BRANCH"; then
    printf '\n以下文件存在冲突：\n' >&2
    git diff --name-only --diff-filter=U >&2 || true
    fail "解决冲突后执行 git add -A && git commit，再推送 $CUSTOM_BRANCH"
fi

step "最近的提交"
git log --oneline -5

if [[ "${NO_PUSH:-0}" != "1" ]]; then
    step "推送 $CUSTOM_BRANCH 到 $ORIGIN_REMOTE"
    git push "$ORIGIN_REMOTE" "$CUSTOM_BRANCH"
fi

printf '\n同步完成。当前分支：%s\n' "$(git branch --show-current)"
printf '镜像构建请查看 %s 分支上的 Publish container images 工作流。\n' "$CUSTOM_BRANCH"
