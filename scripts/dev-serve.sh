#!/usr/bin/env bash
# Start the dev server as a background daemon (pid + log files,
# kill old daemon first, rotate logs).
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p .dev

if [ -f .dev/dev.pid ]; then
  pid="$(cat .dev/dev.pid)"
  if kill -0 "$pid" 2>/dev/null; then
    echo "killing existing dev server (pid $pid)"
    bash scripts/dev-stop.sh
  else
    rm -f .dev/dev.pid
  fi
fi

if [ -f .dev/dev.log ]; then
  mv .dev/dev.log ".dev/dev.log.$(date +%Y%m%d-%H%M%S)"
fi

# Own process group so dev-stop.sh can kill the entire tree
# (pnpm wrapper + vite child).
setsid nohup pnpm dev >.dev/dev.log 2>&1 &
echo $! >.dev/dev.pid

echo "dev server starting (pid $(cat .dev/dev.pid))"
echo "log: .dev/dev.log  url: https://localhost:3111"
