#!/bin/sh
set -e

# When PUID is set, drop from root to PUID:PGID so files written into the
# library bind mounts are owned by that user instead of root. The libraries
# themselves are intentionally never chowned — set PUID to the uid that
# already owns them on the host.
if [ -n "${PUID:-}" ]; then
  PGID="${PGID:-$PUID}"
  echo "worker-entrypoint: starting worker as ${PUID}:${PGID} (umask ${UMASK:-0022})"
  # UMASK=0002 makes created files/folders group-writable, so other
  # accounts in the library's group can manage them directly.
  umask "${UMASK:-0022}"
  # Named volumes are created root-owned by docker; hand the writable ones
  # to the runtime user.
  chown -R "${PUID}:${PGID}" /data/covers /data/logs
  export HOME=/tmp
  exec gosu "${PUID}:${PGID}" node dist/index.js
fi

exec node dist/index.js
