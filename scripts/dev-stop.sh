#!/usr/bin/env bash
# Stop the background dev daemon started by dev-serve.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .dev/dev.pid ]; then
  echo "no pid file; is the dev server running?"
  exit 0
fi

pid="$(cat .dev/dev.pid)"
if kill -0 "$pid" 2>/dev/null; then
  # Kill the whole process group (pnpm wrapper + next child).
  kill -- "-$pid" 2>/dev/null || {
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  }
  echo "stopped dev server (pid $pid)"
else
  echo "stale pid $pid"
fi
rm -f .dev/dev.pid

# Give the port a moment to be released before a restart.
for _ in 1 2 3 4 5; do
  sleep 1
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
done
