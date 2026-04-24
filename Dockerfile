FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/ingest/package.json packages/ingest/
COPY packages/kobo/package.json packages/kobo/
COPY packages/shared/package.json packages/shared/
COPY packages/auth/package.json packages/auth/
COPY workers/library-worker/package.json workers/library-worker/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm db:generate
RUN pnpm build

FROM base AS web
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && case "$(dpkg --print-architecture)" in \
       amd64) KEPUBIFY_ARCH=64bit ;; \
       arm64) KEPUBIFY_ARCH=arm64 ;; \
       armhf) KEPUBIFY_ARCH=armv6 ;; \
       i386)  KEPUBIFY_ARCH=32bit ;; \
       *) echo "unsupported arch: $(dpkg --print-architecture)" >&2; exit 1 ;; \
     esac \
  && curl -fsSL "https://github.com/pgaskin/kepubify/releases/latest/download/kepubify-linux-${KEPUBIFY_ARCH}" -o /usr/local/bin/kepubify \
  && chmod +x /usr/local/bin/kepubify \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules node_modules
RUN PRISMA_DIR="$(find /app/node_modules/.pnpm -path '*/node_modules/@prisma' | head -n1)" \
  && ln -s "$PRISMA_DIR" /app/node_modules/@prisma
COPY --from=build /app/apps/web/.output .output
COPY --from=build /app/packages/db/prisma packages/db/prisma
COPY --from=build /app/packages/db/prisma.config.ts packages/db/prisma.config.ts
COPY --from=build /app/packages/db/package.json packages/db/package.json
COPY --from=build /app/packages/db/node_modules packages/db/node_modules
COPY scripts/web-entrypoint.sh /usr/local/bin/web-entrypoint.sh
RUN chmod +x /usr/local/bin/web-entrypoint.sh
CMD ["/usr/local/bin/web-entrypoint.sh"]

FROM base AS worker
WORKDIR /app/workers/library-worker
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/workers/library-worker/node_modules node_modules
COPY --from=build /app/workers/library-worker/dist dist
CMD ["node", "dist/index.js"]
