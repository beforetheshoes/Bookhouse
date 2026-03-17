import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "packages/**/*.ts",
        "apps/web/src/**/*.ts",
        "apps/web/src/**/*.tsx",
      ],
      exclude: ["**/*.d.ts", "apps/web/src/routeTree.gen.ts"],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
});
