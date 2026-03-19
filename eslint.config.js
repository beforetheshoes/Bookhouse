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
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // vi.mocked(obj.method) is a standard vitest pattern; all mocked methods
      // are vi.fn() arrow functions and have no meaningful `this` binding.
      "@typescript-eslint/unbound-method": "off",
      // vi.fn() mock calls and expect.objectContaining() return `any` in vitest's
      // type definitions; these rules produce false positives in test assertions.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      // Tests intentionally throw non-Error values to exercise error-handling code paths.
      "@typescript-eslint/only-throw-error": "off",
    },
  },
);
