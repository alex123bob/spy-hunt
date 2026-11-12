#!/bin/bash
# Run on your laptop: check the build, bump the version and commit it. It does NOT tag or push:
#   1. push the commit
#   2. GitHub -> Actions -> release -> Run workflow (it creates the v<version> tag and the release)
# Usage: yarn release [patch|minor|major]   (default: patch)

set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-patch}"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash your changes first."
  exit 1
fi
if [ "$(git branch --show-current)" != "main" ]; then
  echo "Release from the main branch."
  exit 1
fi

git pull --ff-only
# Fail early if the project does not build
yarn install --silent --frozen-lockfile
yarn build >/dev/null

# Bump package.json / yarn.lock only; the tag is created later by the GitHub Action
VERSION=$(yarn version --"$BUMP" --no-git-tag-version | sed -n 's/^info New version: //p')
git add package.json yarn.lock
git commit -q -m "Release v$VERSION"

echo
echo "Committed 'Release v$VERSION'. Next:"
echo "  1. Push it: git push"
echo "  2. GitHub -> Actions -> release -> Run workflow (branch: main, tag: leave empty)"
echo "  3. On the server:  ./server-deploy.sh"
