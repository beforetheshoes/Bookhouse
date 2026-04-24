import { defineConfig } from "tsup";
import { builtinModules } from "node:module";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  noExternal: [/^@bookhouse\//],
  external: builtinModules.flatMap((m) => [m, `node:${m}`]),
  banner: {
    js: "import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);",
  },
});
