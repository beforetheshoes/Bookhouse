import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a ?? {}),
    };
    return b;
  },
}));

const findManyMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: { collection: { findMany: findManyMock } },
}));

import { getCollectionsServerFn } from "./collections";

describe("getCollectionsServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("calls db.collection.findMany with correct include and orderBy", async () => {
    findManyMock.mockResolvedValue([]);
    await getCollectionsServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { name: "asc" },
    });
  });

  it("returns the result from findMany", async () => {
    const fakeData = [{ id: "1", name: "My Collection", _count: { items: 5 } }];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getCollectionsServerFn();
    expect(result).toBe(fakeData);
  });
});
