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
    exclude: [".claude/**", "**/node_modules/**"],
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
        "workers/**/*.ts",
      ],
      exclude: ["**/*.d.ts", "apps/web/src/routeTree.gen.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
