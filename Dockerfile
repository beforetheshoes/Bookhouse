FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/ingest/package.json packages/ingest/
COPY packages/shared/package.json packages/shared/
COPY packages/auth/package.json packages/auth/
COPY workers/library-worker/package.json workers/library-worker/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm db:generate
RUN pnpm build

FROM base AS web
COPY --from=build /app/apps/web/.output .output
CMD ["node", ".output/server/index.mjs"]

FROM base AS worker
COPY --from=build /app/workers/library-worker/dist dist
CMD ["node", "dist/index.js"]
