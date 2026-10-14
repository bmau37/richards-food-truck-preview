#!/usr/bin/env bash
# Re-copy the site folder into this repo and push to main (GitHub Pages redeploys automatically).
set -euo pipefail
SRC=/workspace/richards-food-truck/site
DEST="$(cd "$(dirname "$0")" && pwd)"
# clear old tracked content (keep .git and this script), then copy fresh
find "$DEST" -mindepth 1 -maxdepth 1 ! -name .git ! -name redeploy.sh -exec rm -rf {} +
cp -a "$SRC/." "$DEST/"
rm -f "$DEST/README.md" "$DEST/REVIEW.md"
touch "$DEST/.nojekyll"
grep -q 'noindex' "$DEST/index.html" || { echo "noindex meta missing - aborting" >&2; exit 1; }
cd "$DEST"
git add -A
if git diff --cached --quiet; then echo "No changes."; exit 0; fi
git commit -m "${1:-Update site preview $(date '+%Y-%m-%d %H:%M')}"
git branch -M main
git push -u origin main
