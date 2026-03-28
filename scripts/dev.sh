#!/usr/bin/env bash
# Wrapper around `pnpm -r --parallel dev` that ensures all child processes
# are cleaned up on exit. Without this, tsx watch processes survive Ctrl+C
# because pnpm doesn't forward SIGINT to grandchildren on macOS.

set -euo pipefail

load_dotenv_file() {
  local env_file="$1"
  local line

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"

    if [[ -z "$line" || "$line" == \#* ]]; then
      continue
    fi

    if [[ "$line" != *=* ]]; then
      continue
    fi

    local key="${line%%=*}"
    local value="${line#*=}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$key=$value"
  done < "$env_file"
}

if [[ -f ".env" ]]; then
  load_dotenv_file ".env"
fi

# Kill stale workers from previous runs
pkill -f '@bookhouse/library-worker.*exec tsx' 2>/dev/null || true

# Start dev in background, then trap EXIT to kill the entire process group
trap 'kill 0 2>/dev/null' EXIT
pnpm -r --parallel dev &
wait
