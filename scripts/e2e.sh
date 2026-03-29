#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# E2E environment — must match playwright.config.ts and e2e/oidc-mock.ts
export DATABASE_URL="postgresql://bookhouse:bookhouse@localhost:5432/bookhouse_test"
export QUEUE_URL="redis://localhost:6379"
export AUTH_SECRET="e2e-test-secret-at-least-32-chars!!"
export AUTH_OIDC_ISSUER="http://localhost:9090"
export AUTH_OIDC_CLIENT_ID="e2e-client"
export AUTH_OIDC_CLIENT_SECRET="e2e-secret"
export APP_URL="http://localhost:3000"
export COVER_CACHE_DIR="/tmp/e2e-covers"
# Inherit pg_dump/psql paths from the environment (needed on machines where
# pg_dump is not in PATH — set PG_DUMP_PATH/PSQL_PATH in your shell or CI env)
export PG_DUMP_PATH="${PG_DUMP_PATH:-pg_dump}"
export PSQL_PATH="${PSQL_PATH:-psql}"

UI_MODE=0
SKIP_BUILD=0
PLAYWRIGHT_EXTRA_ARGS=()

usage() {
  echo "Usage: $0 [options] [playwright args...]"
  echo ""
  echo "Options:"
  echo "  --ui          Open Playwright UI mode"
  echo "  --skip-build  Skip the build step (use existing .output/)"
  echo "  --help        Show this help"
  echo ""
  echo "Examples:"
  echo "  $0                             # Run all tests headlessly"
  echo "  $0 --ui                        # Open Playwright UI"
  echo "  $0 --skip-build                # Skip build, run tests"
  echo "  $0 e2e/library.spec.ts         # Run a single spec"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ui)        UI_MODE=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --help|-h)   usage; exit 0 ;;
    *)           PLAYWRIGHT_EXTRA_ARGS+=("$1"); shift ;;
  esac
done

# ── Cleanup ───────────────────────────────────────────────────────────────────

APP_PID=""
WORKER_PID=""

cleanup() {
  if [[ -n "$APP_PID" ]]; then
    echo "Stopping app (pid $APP_PID)"
    kill "$APP_PID" 2>/dev/null || true
  fi
  if [[ -n "$WORKER_PID" ]]; then
    echo "Stopping worker (pid $WORKER_PID)"
    kill "$WORKER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Prerequisites ─────────────────────────────────────────────────────────────

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Start Docker Desktop / OrbStack / Colima first."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but was not found."
  exit 1
fi

# ── Infrastructure ────────────────────────────────────────────────────────────

mkdir -p "$COVER_CACHE_DIR"

echo "Starting local infrastructure (postgres + valkey)"
docker compose up -d db queue

echo "Ensuring test database exists"
docker compose exec -T db psql -U bookhouse -tc \
  "SELECT 1 FROM pg_database WHERE datname = 'bookhouse_test'" | grep -q 1 \
  || docker compose exec -T db createdb -U bookhouse bookhouse_test

echo "Applying database migrations"
pnpm db:migrate

# ── Build ─────────────────────────────────────────────────────────────────────

if [[ "$SKIP_BUILD" == "0" ]]; then
  echo "Building app"
  pnpm --filter @bookhouse/web build
else
  echo "Skipping build (--skip-build)"
fi

# Ensure @prisma/client is resolvable from the production server output.
# Prisma is marked as external in the Vite build so it won't be bundled;
# we create a symlink in the output's node_modules so Node can find it.
PRISMA_CLIENT_SRC="$ROOT_DIR/packages/db/node_modules/@prisma/client"
PRISMA_CLIENT_DEST="$ROOT_DIR/apps/web/.output/server/node_modules/@prisma/client"
mkdir -p "$(dirname "$PRISMA_CLIENT_DEST")"
if [[ ! -e "$PRISMA_CLIENT_DEST" ]]; then
  ln -s "$PRISMA_CLIENT_SRC" "$PRISMA_CLIENT_DEST"
fi

# ── Start app + worker ────────────────────────────────────────────────────────

# Free port 3000 if a dev server is already running there
if lsof -ti :3000 >/dev/null 2>&1; then
  echo "Stopping existing process on :3000"
  kill $(lsof -ti :3000) 2>/dev/null || true
  sleep 1
fi

echo "Starting app server"
node apps/web/.output/server/index.mjs &
APP_PID=$!

echo "Starting library worker"
pnpm --filter @bookhouse/library-worker exec tsx src/index.ts &
WORKER_PID=$!

echo "Waiting for app to be ready on :3000"
pnpm exec wait-on http://localhost:3000 --timeout 30000

# ── Run Playwright ────────────────────────────────────────────────────────────

if [[ "$UI_MODE" == "1" ]]; then
  echo "Opening Playwright UI"
  pnpm exec playwright test --ui "${PLAYWRIGHT_EXTRA_ARGS[@]+"${PLAYWRIGHT_EXTRA_ARGS[@]}"}"
else
  echo "Running E2E tests"
  pnpm exec playwright test "${PLAYWRIGHT_EXTRA_ARGS[@]+"${PLAYWRIGHT_EXTRA_ARGS[@]}"}"
fi
