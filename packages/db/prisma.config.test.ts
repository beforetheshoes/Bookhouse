import { describe, expect, it, vi } from "vitest";

vi.mock("prisma/config", () => ({
  defineConfig: (input: object) => input,
  env: (name: string) => `env:${name}`,
}));

describe("prisma config", () => {
  it("exports the schema and datasource configuration", async () => {
    const config = await import("./prisma.config");

    expect(config.prismaSchemaPath).toContain("packages/db/prisma/schema.prisma");
    expect(config.prismaDatasourceUrl).toBe("env:DATABASE_URL");
    expect(config.default).toEqual({
      schema: expect.stringContaining("packages/db/prisma/schema.prisma"),
      datasource: {
        url: "env:DATABASE_URL",
      },
    });
  });
});
