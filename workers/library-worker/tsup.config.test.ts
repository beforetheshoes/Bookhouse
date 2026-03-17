import { describe, expect, it } from "vitest";

describe("library worker tsup config", () => {
  it("defines the worker bundle entry and node externals", async () => {
    const configModule = await import("./tsup.config");
    const config = configModule.default;

    expect(config.entry).toEqual(["src/index.ts"]);
    expect(config.format).toBe("esm");
    expect(config.noExternal).toEqual([/.*/]);
    expect(config.external).toContain("node:fs");
    expect(config.banner?.js).toContain("__bundleCreateRequire");
  });
});
