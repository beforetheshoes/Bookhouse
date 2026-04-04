import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "apps/web/src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30000,
    exclude: [".claude/**", "**/node_modules/**", "**/.output/**", "e2e/**"],
    environmentMatchGlobs: [
      ["apps/web/src/**/*.test.{ts,tsx}", "happy-dom"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "packages/**/*.ts",
        "apps/web/src/**/*.ts",
        "apps/web/src/**/*.tsx",
        "apps/web/server/routes/api/**/*.ts",
        "apps/web/server/routes/kobo/**/*.ts",
        "apps/web/server/routes/opds/**/*.ts",
        "apps/web/server/utils/**/*.ts",
        "workers/**/*.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "apps/web/src/routeTree.gen.ts",
        "packages/kobo/src/types.ts",
        "packages/kobo/src/index.ts",
        "packages/opds/src/types.ts",
        "packages/opds/src/index.ts",
        "packages/ingest/src/index.ts",
        // Runtime-only files: no testable factory functions, covered by c8 ignore
        "**/*unmatched*",
        "**/image.jpg.ts",
        "apps/web/server/routes/kobo/**/oauth/.well-known/**",
        "apps/web/server/routes/api/editions/download-all/**",
        "apps/web/server/routes/api/edition-files/download/**",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
