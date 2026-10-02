#!/usr/bin/env bash
# Publishes to the gh-pages branch without disturbing the other half:
#   publish-pages.sh app   → replace the app build (dist/) and keep data/
#   publish-pages.sh data  → replace only data/dashboard.enc.json (+ content.hmac), keep the app
# Only the ENCRYPTED payload is ever published; the plaintext stays in .data/ on the runner.
set -euo pipefail
mode="${1:?usage: publish-pages.sh app|data}"
repo_url="${PAGES_REMOTE:-https://x-access-token:${GITHUB_TOKEN:-}@github.com/${GITHUB_REPOSITORY:-}.git}"
work="$(mktemp -d)"

if git ls-remote --exit-code --heads "$repo_url" gh-pages >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch gh-pages "$repo_url" "$work"
else
  git init --quiet "$work"
  git -C "$work" checkout --quiet --orphan gh-pages
  git -C "$work" remote add origin "$repo_url"
fi

case "$mode" in
  app)
    test -f dist/index.html || { echo "dist/ missing — run npm run build"; exit 1; }
    find "$work" -mindepth 1 -maxdepth 1 ! -name .git ! -name data -exec rm -rf {} +
    cp -R dist/. "$work/"
    touch "$work/.nojekyll"
    msg="deploy app ${GITHUB_SHA:0:7}"
    ;;
  data)
    test -f .data/publish/dashboard.enc.json || { echo "no encrypted payload"; exit 1; }
    if grep -q '"entities"' .data/publish/dashboard.enc.json; then echo "refusing: payload is not encrypted"; exit 1; fi
    mkdir -p "$work/data"
    cp .data/publish/dashboard.enc.json "$work/data/dashboard.enc.json"
    cp .data/publish/content.hmac "$work/data/content.hmac"
    msg="sync data $(date -u +%Y-%m-%dT%H:%MZ)"
    ;;
  *) echo "unknown mode $mode"; exit 1 ;;
esac

cd "$work"
git config user.name "kp7-bot"
git config user.email "kp7-bot@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "gh-pages: nothing to publish"
  exit 0
fi
git commit --quiet -m "$msg"
git push --quiet origin gh-pages
echo "gh-pages: published ($mode)"
