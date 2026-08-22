#!/usr/bin/env bash
# Vendor the @rod2ik/tikzjax runtime assets into public/tikzjax so the app
# never depends on a CDN at runtime (local-first, offline-first).
set -euo pipefail
cd "$(dirname "$0")/.."

src="node_modules/@rod2ik/tikzjax/dist"
dest="public/tikzjax"

if [ ! -d "$src" ]; then
  echo "@rod2ik/tikzjax dist not found; run pnpm install first" >&2
  exit 1
fi

rm -rf "$dest"
mkdir -p "$(dirname "$dest")"
cp -r "$src" "$dest"

echo "vendored @rod2ik/tikzjax -> $dest ($(find "$dest" -type f | wc -l) files)"
