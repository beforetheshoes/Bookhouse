import { describe, expect, it, vi } from "vitest";

const prismaConstructorMock = vi.fn();

vi.mock("@prisma/client", () => {
  function PrismaClient() {
    prismaConstructorMock();
  }

  return { PrismaClient };
});

describe("db package", () => {
  it("creates and exports a prisma singleton", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    const { PrismaClient, db } = await import("./index");

    expect(prismaConstructorMock).toHaveBeenCalledTimes(1);
    expect(db).toBeInstanceOf(PrismaClient);
  });

  it("does not cache the prisma client globally in production", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    delete (globalThis as { prisma?: unknown }).prisma;

    await import("./index");

    expect((globalThis as { prisma?: unknown }).prisma).toBeUndefined();
  });
});
