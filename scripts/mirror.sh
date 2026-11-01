#!/usr/bin/env bash
# Push the docs folder's history to its standalone repository, which deploys
# GitHub Pages on push to main:
#   docs -> meghjs/meghjs.github.io
#
# The npm packages are no longer mirrored: they are versioned and published
# from this repository with Lerna (see README.md).
#
# Usage:
#   scripts/mirror.sh          mirror docs
#   scripts/mirror.sh docs     same
#
# Pushes are fast-forward only: if the standalone repo has commits the
# monorepo does not, the push is rejected instead of overwriting them.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

prefix_of() {
  case "$1" in
    docs) echo "docs" ;;
    *) echo "Unknown target '$1' (expected docs)" >&2; exit 1 ;;
  esac
}

remote_of() {
  case "$1" in
    docs) echo "https://github.com/meghjs/meghjs.github.io.git" ;;
  esac
}

mirror() {
  local target="$1" prefix remote sha
  prefix="$(prefix_of "$target")"
  remote="$(remote_of "$target")"
  echo "==> $target: splitting $prefix"
  sha="$(git subtree split -q --prefix="$prefix" HEAD)"
  echo "==> $target: pushing $sha to $remote main"
  git push "$remote" "$sha:refs/heads/main"
}

if [ "$#" -eq 0 ]; then
  set -- docs
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Note: uncommitted changes are not mirrored; only committed history is pushed." >&2
fi

for target in "$@"; do
  mirror "$target"
done
