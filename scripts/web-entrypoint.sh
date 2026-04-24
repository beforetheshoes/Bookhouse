#!/bin/sh
set -e

PRISMA_CLI=$(ls /app/node_modules/.pnpm/prisma@*/node_modules/prisma/build/index.js 2>/dev/null | head -n1)
if [ -z "$PRISMA_CLI" ]; then
  echo "web-entrypoint: prisma CLI not found in /app/node_modules/.pnpm" >&2
  exit 1
fi

echo "web-entrypoint: applying database migrations"
(cd /app/packages/db && node "$PRISMA_CLI" migrate deploy)

echo "web-entrypoint: starting server"
exec node /app/.output/server/index.mjs
