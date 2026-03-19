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
    exclude: [".claude/**", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "packages/**/*.ts",
        "apps/web/src/**/*.ts",
        "apps/web/src/**/*.tsx",
        "workers/**/*.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "apps/web/src/routeTree.gen.ts",
        // Component, hook, and route tests are tracked in issue #56
        "apps/web/src/components/**",
        "apps/web/src/hooks/**",
        "apps/web/src/routes/_authenticated.tsx",
        "apps/web/src/routes/_authenticated/**",
        "apps/web/src/lib/server-fns/**",
        "apps/web/src/lib/mutation.ts",
        "apps/web/src/lib/utils.ts",
        // Barrel re-export files have no executable statements for V8 coverage
        "packages/shared/src/index.ts",
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
