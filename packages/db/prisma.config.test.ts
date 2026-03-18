import { describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.fn(() => false);
const readFileSyncMock = vi.fn(() => "");

vi.mock("node:fs", () => ({
  default: {
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
  },
}));

vi.mock("prisma/config", () => ({
  defineConfig: (input: unknown) => input,
  env: (name: string) => `env:${name}`,
}));

describe("prisma config", () => {
  it("loads workspace env values before resolving prisma env vars", async () => {
    existsSyncMock.mockReturnValueOnce(true);
    readFileSyncMock.mockReturnValueOnce("DATABASE_URL=postgresql://from-env-file\nAUTH_SECRET=\"quoted-secret\"\n");

    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalAuthSecret = process.env.AUTH_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;

    vi.resetModules();
    const config = await import("./prisma.config");

    expect(config.workspaceEnvPath).toContain(".env");
    expect(process.env.DATABASE_URL).toBe("postgresql://from-env-file");
    expect(process.env.AUTH_SECRET).toBe("quoted-secret");

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  it("exports the schema and datasource configuration", async () => {
    vi.resetModules();
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

  it("does not override shell-provided env values", async () => {
    existsSyncMock.mockReturnValueOnce(true);
    readFileSyncMock.mockReturnValueOnce("DATABASE_URL=postgresql://from-env-file\n");

    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://from-shell";

    vi.resetModules();
    await import("./prisma.config");

    expect(process.env.DATABASE_URL).toBe("postgresql://from-shell");

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("ignores malformed env lines and preserves already-set keys", async () => {
    existsSyncMock.mockReturnValueOnce(true);
    readFileSyncMock.mockReturnValueOnce([
      "# comment",
      "",
      "MALFORMED_LINE",
      "=missing_key",
      "DATABASE_URL='postgresql://from-env-file'",
    ].join("\n"));

    const originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    vi.resetModules();
    await import("./prisma.config");

    expect(process.env.DATABASE_URL).toBe("postgresql://from-env-file");

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });
});
