#!/bin/sh
set -e

PRISMA_CLI=$(ls /app/node_modules/.pnpm/prisma@*/node_modules/prisma/build/index.js 2>/dev/null | head -n1)
if [ -z "$PRISMA_CLI" ]; then
  echo "web-entrypoint: prisma CLI not found in /app/node_modules/.pnpm" >&2
  exit 1
fi

echo "web-entrypoint: applying database migrations"
(cd /app/packages/db && node "$PRISMA_CLI" migrate deploy)

# When PUID is set, drop from root to PUID:PGID for the server process so
# files created in the library bind mounts are owned by that user instead
# of root. The libraries themselves are intentionally never chowned — set
# PUID to the uid that already owns them on the host.
if [ -n "${PUID:-}" ]; then
  PGID="${PGID:-$PUID}"
  echo "web-entrypoint: starting server as ${PUID}:${PGID} (umask ${UMASK:-0022})"
  # UMASK=0002 makes created files/folders group-writable, so other
  # accounts in the library's group can manage them directly.
  umask "${UMASK:-0022}"
  # Named volumes are created root-owned by docker; hand the writable ones
  # (and the upload staging dir under the app cwd) to the runtime user.
  chown -R "${PUID}:${PGID}" /data/kepub-cache /data/logs
  install -d -o "${PUID}" -g "${PGID}" /app/.tmp-uploads
  export HOME=/tmp
  exec gosu "${PUID}:${PGID}" node /app/.output/server/index.mjs
fi

echo "web-entrypoint: starting server"
exec node /app/.output/server/index.mjs
