import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.output/**",
      "**/node_modules/**",
      "apps/web/src/routeTree.gen.ts",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-import-type-side-effects": "error",
      // TanStack Router uses `throw redirect(...)` to perform redirects from loaders/beforeLoad.
      // redirect() returns a Redirect type (which extends Response), not an Error.
      "@typescript-eslint/only-throw-error": [
        "error",
        { allow: [{ from: "lib", name: "Response" }] },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSUnknownKeyword",
          message: "Do not use the `unknown` type. Use a specific type instead.",
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
