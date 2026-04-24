import { afterEach, describe, expect, it, vi } from "vitest";

type PrismaGlobal = {
  prisma?: object;
};

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalPrisma = (globalThis as PrismaGlobal).prisma;

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@prisma/client");
  vi.doUnmock("@prisma/adapter-pg");
  process.env.DATABASE_URL = originalDatabaseUrl;
  process.env.NODE_ENV = originalNodeEnv;
  if (originalPrisma === undefined) {
    delete (globalThis as PrismaGlobal).prisma;
  } else {
    (globalThis as PrismaGlobal).prisma = originalPrisma;
  }
});

describe("packages/db Prisma singleton", () => {
  it("creates and caches a client outside production, defaulting DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "development";
    delete (globalThis as PrismaGlobal).prisma;

    const mockPrismaClient = vi.fn(function MockPrismaClient(
      this: { kind: string; adapter: object },
      { adapter }: { adapter: object },
    ) {
      this.kind = "new-client";
      this.adapter = adapter;
    });
    const mockPrismaPg = vi.fn(function MockPrismaPg(
      this: { connectionString: string },
      { connectionString }: { connectionString: string },
    ) {
      this.connectionString = connectionString;
    });

    vi.doMock("@prisma/client", () => ({
      PrismaClient: mockPrismaClient,
    }));
    vi.doMock("@prisma/adapter-pg", () => ({
      PrismaPg: mockPrismaPg,
    }));

    const mod = await import("./index");

    expect(mockPrismaPg).toHaveBeenCalledWith({
      connectionString: "postgresql://bookhouse:bookhouse@localhost:5432/bookhouse",
    });
    expect(mockPrismaClient).toHaveBeenCalledTimes(1);
    expect(mod.db).toEqual({
      kind: "new-client",
      adapter: { connectionString: "postgresql://bookhouse:bookhouse@localhost:5432/bookhouse" },
    });
    expect((globalThis as PrismaGlobal).prisma).toEqual(mod.db);
  });

  it("reuses a cached client in production without mutating the global", async () => {
    process.env.DATABASE_URL = "postgresql://example";
    process.env.NODE_ENV = "production";
    (globalThis as PrismaGlobal).prisma = { kind: "cached-client" };

    const mockPrismaClient = vi.fn(function MockPrismaClient(this: object, _args: object) {
      return this;
    });
    const mockPrismaPg = vi.fn(function MockPrismaPg(
      this: { connectionString: string },
      { connectionString }: { connectionString: string },
    ) {
      this.connectionString = connectionString;
    });

    vi.doMock("@prisma/client", () => ({
      PrismaClient: mockPrismaClient,
    }));
    vi.doMock("@prisma/adapter-pg", () => ({
      PrismaPg: mockPrismaPg,
    }));

    const mod = await import("./index");

    expect(mockPrismaPg).toHaveBeenCalledWith({ connectionString: "postgresql://example" });
    expect(mockPrismaClient).not.toHaveBeenCalled();
    expect(mod.db).toEqual({ kind: "cached-client" });
    expect((globalThis as PrismaGlobal).prisma).toEqual({ kind: "cached-client" });
  });
});
