import { describe, expect, it, vi } from "vitest";

const prismaConstructorMock = vi.fn();

vi.mock("@prisma/client", () => {
  class PrismaClient {
    constructor() {
      prismaConstructorMock();
    }
  }

  return { PrismaClient };
});

describe("db package", () => {
  it("creates and exports a prisma singleton", async () => {
    vi.resetModules();
    const { PrismaClient, db } = await import("./index");

    expect(prismaConstructorMock).toHaveBeenCalledTimes(1);
    expect(db).toBeInstanceOf(PrismaClient);
  });
});
