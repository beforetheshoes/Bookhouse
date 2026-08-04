FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/ingest/package.json packages/ingest/
COPY packages/kobo/package.json packages/kobo/
COPY packages/opds/package.json packages/opds/
COPY packages/shared/package.json packages/shared/
COPY workers/library-worker/package.json workers/library-worker/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm db:generate
RUN pnpm build

FROM base AS web
# kepubify (KEPUB conversion) + postgresql-client-17 (the in-app Backup/Restore
# feature shells out to pg_dump/psql). The client major must be >= the Postgres
# server major (17), or pg_dump refuses to dump; Debian bookworm only ships 15,
# so pull 17 from the PostgreSQL APT (PGDG) repo.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gosu \
  && case "$(dpkg --print-architecture)" in \
       amd64) KEPUBIFY_ARCH=64bit ;; \
       arm64) KEPUBIFY_ARCH=arm64 ;; \
       armhf) KEPUBIFY_ARCH=armv6 ;; \
       i386)  KEPUBIFY_ARCH=32bit ;; \
       *) echo "unsupported arch: $(dpkg --print-architecture)" >&2; exit 1 ;; \
     esac \
  && curl -fsSL "https://github.com/pgaskin/kepubify/releases/latest/download/kepubify-linux-${KEPUBIFY_ARCH}" -o /usr/local/bin/kepubify \
  && chmod +x /usr/local/bin/kepubify \
  && install -d /usr/share/keyrings \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/keyrings/pgdg.asc \
  && echo "deb [signed-by=/usr/share/keyrings/pgdg.asc] http://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/web/.output .output
COPY --from=build /app/packages/db/prisma packages/db/prisma
COPY --from=build /app/packages/db/prisma.config.ts packages/db/prisma.config.ts
COPY --from=build /app/packages/db/package.json packages/db/package.json
COPY --from=build /app/packages/db/node_modules packages/db/node_modules

# Operator scripts (promote-owner, check-user-roles, the backfills) and the
# workspace sources they import. Without these the documented procedures are
# impossible to run against a real deployment: the scripts simply are not in
# the image, so the only way to reach them is to clone the repo and install a
# toolchain, which is not something an operator of a published image can do.
#
# @bookhouse/db and @bookhouse/ingest export TypeScript directly
# (exports: "./src/index.ts"), which is why the sources ship rather than a
# build output, and why tsx is a root devDependency — that is what puts it in
# node_modules/.bin above.
#
# scripts/ has no node_modules of its own, so its bare specifiers resolve from
# the root. Only packages listed in the root package.json get linked there,
# which is why @bookhouse/ingest and ioredis are root devDependencies: without
# them the two backfills and queue-check fail to resolve, in this image and on
# a dev checkout alike.
COPY --from=build /app/packages/db/src packages/db/src
COPY --from=build /app/packages/ingest/src packages/ingest/src
COPY --from=build /app/packages/ingest/package.json packages/ingest/package.json
COPY --from=build /app/packages/ingest/node_modules packages/ingest/node_modules
COPY --from=build /app/packages/domain packages/domain
COPY --from=build /app/packages/shared/src packages/shared/src
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/scripts scripts
# The workspace root manifest, purely for its "type": "module". Without it the
# nearest manifest above scripts/ is absent, tsx transforms the scripts as CJS,
# and every one using top-level await dies in esbuild. The server is unaffected
# either way — .output/server/package.json declares its own type.
COPY --from=build /app/package.json package.json
COPY scripts/web-entrypoint.sh /usr/local/bin/web-entrypoint.sh
RUN chmod +x /usr/local/bin/web-entrypoint.sh
CMD ["/usr/local/bin/web-entrypoint.sh"]

FROM base AS worker
# gosu lets the entrypoint drop from root to PUID:PGID after fixing up
# volume ownership, so files written into the library aren't root-owned.
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/workers/library-worker
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/workers/library-worker/node_modules node_modules
COPY --from=build /app/workers/library-worker/dist dist
COPY scripts/worker-entrypoint.sh /usr/local/bin/worker-entrypoint.sh
RUN chmod +x /usr/local/bin/worker-entrypoint.sh
CMD ["/usr/local/bin/worker-entrypoint.sh"]
