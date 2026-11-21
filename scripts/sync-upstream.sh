#!/usr/bin/env bash
set -euo pipefail

# Only propose merges. Never reset main or choose one side of a conflict.
: "${GH_REPO:?GH_REPO must identify the fork}"
: "${GH_TOKEN:?GH_TOKEN is required to open the proposal}"
git fetch origin main
if ! git remote get-url upstream >/dev/null 2>&1; then
    git remote add upstream https://github.com/uhhhh15/QR.git
fi
git fetch upstream main

if git merge-base --is-ancestor upstream/main origin/main; then
    echo 'The fork already contains the latest upstream changes.'
    exit 0
fi

pending=$(gh pr list --repo "$GH_REPO" --base main --state open --limit 100 \
    --json headRefName --jq '[.[] | select(.headRefName | startswith("automation/upstream-"))] | length')
if [ "$pending" -gt 0 ]; then
    echo 'An upstream proposal is awaiting review; keeping it unchanged.'
    exit 0
fi

upstream_sha=$(git rev-parse upstream/main)
fork_sha=$(git rev-parse origin/main)
branch="automation/upstream-${upstream_sha:0:12}-${fork_sha:0:12}"
previous=$(gh pr list --repo "$GH_REPO" --head "$branch" --state all --json number --jq 'length')
if [ "$previous" -gt 0 ]; then
    echo 'This exact update has already been proposed. Review or reopen that proposal.'
    exit 0
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    # Recover if a prior run pushed successfully but could not create the PR.
    git fetch origin "$branch"
    git checkout -b "$branch" FETCH_HEAD
    git merge-base --is-ancestor "$fork_sha" HEAD
    git merge-base --is-ancestor "$upstream_sha" HEAD
else
    git checkout -b "$branch" origin/main
    if ! git -c merge.renormalize=true merge --no-ff --no-edit upstream/main; then
        git diff --name-only --diff-filter=U
        git merge --abort
        echo '::error::Upstream conflicts with fork changes. Manual resolution is required; main was not changed.'
        exit 1
    fi
fi

# Use the guards from the fork's reviewed base, not any changes being proposed.
guard=$(mktemp --suffix=.mjs)
trap 'rm -f "$guard"' EXIT
git show origin/main:scripts/check-fork.mjs > "$guard"
node "$guard"
git push origin "HEAD:refs/heads/$branch"

body=$(mktemp)
trap 'rm -f "$guard" "$body"' EXIT
cat > "$body" <<EOF
将 uhhhh15/QR 的 main 合并到本 fork，等待人工确认后更新正式版本。

- 上游提交：$upstream_sha
- 本次 fork 基线：$fork_sha
- 使用正常 Git 合并保留双方历史；发生冲突时停止，不覆盖本 fork。
- 已通过 JavaScript 语法检查及 fork 优化回归检查。
- 请在酒馆中确认主题、白名单和按钮显示，再合并此提案。

本提案不会自动合并。提案待确认期间，自动任务不会改动它；合并后会继续检查下一次更新。
EOF
gh pr create --repo "$GH_REPO" --base main --head "$branch" \
    --title "同步原仓库更新（${upstream_sha:0:7}）" --body-file "$body"
