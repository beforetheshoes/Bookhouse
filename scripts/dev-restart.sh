#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

kill_pattern_if_running() {
  local pattern="$1"
  local matches

  matches="$(pgrep -af "$pattern" || true)"
  if [[ -n "$matches" ]]; then
    echo "Stopping processes matching: $pattern"
    pkill -f "$pattern" || true
  fi
}

kill_dev_listener_on_port() {
  local port="$1"

  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"
  if [[ -n "$pids" ]]; then
    local pid
    for pid in $pids; do
      local command
      command="$(ps -p "$pid" -o command= || true)"

      case "$command" in
        *node*|*vite*|*pnpm*|*tsx*)
          echo "Stopping dev listener on port $port (pid $pid)"
          kill "$pid" || true
          ;;
        *)
          echo "Leaving port $port listener alone (pid $pid: $command)"
          ;;
      esac
    done
  fi
}

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

if [[ ! -f ".env" ]]; then
  echo "Missing .env. Copy .env.example to .env first."
  exit 1
fi

echo "Loading environment from .env"
load_dotenv_file ".env"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but was not found."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found."
  exit 1
fi

USE_DOCKER="${BOOKHOUSE_USE_DOCKER:-1}"

if [[ "$USE_DOCKER" == "1" ]]; then
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed, but the daemon is not running."
    echo "Start Docker Desktop / OrbStack / Colima first, then rerun with BOOKHOUSE_USE_DOCKER=1."
    exit 1
  fi
fi

echo "Stopping existing local dev processes"
kill_pattern_if_running "pnpm -r --parallel dev"
kill_pattern_if_running "vite dev"
kill_pattern_if_running "tsx watch src/index.ts"
kill_dev_listener_on_port 3000

if [[ "$USE_DOCKER" == "1" ]]; then
  echo "Restarting local infrastructure"
  docker compose stop web worker >/dev/null 2>&1 || true
  docker compose up -d db queue
else
  echo "Skipping Docker because BOOKHOUSE_USE_DOCKER=0"
fi

echo "Installing dependencies"
pnpm install

echo "Applying database migrations"
pnpm db:migrate

echo "Starting local dev"
exec pnpm dev
