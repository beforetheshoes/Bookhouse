#!/usr/bin/env bash
# Wrapper around `pnpm -r --parallel dev` that ensures all child processes
# are cleaned up on exit. Without this, tsx watch processes survive Ctrl+C
# because pnpm doesn't forward SIGINT to grandchildren on macOS.

set -euo pipefail

# Kill stale workers from previous runs
pkill -f 'tsx.*library-worker' 2>/dev/null || true

# Start dev in background, then trap EXIT to kill the entire process group
trap 'kill 0 2>/dev/null' EXIT
pnpm -r --parallel dev &
wait
