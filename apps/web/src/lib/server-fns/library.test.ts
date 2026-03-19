import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const findManyMock = vi.fn();
vi.mock("@bookhouse/db", () => ({ db: { work: { findMany: findManyMock } } }));

import { getLibraryWorksServerFn } from "./library";

describe("getLibraryWorksServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("calls db.work.findMany with correct include and orderBy options", async () => {
    findManyMock.mockResolvedValue([]);
    await getLibraryWorksServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      include: {
        editions: {
          include: {
            contributors: {
              include: { contributor: true },
            },
          },
        },
      },
      orderBy: { sortTitle: "asc" },
    });
  });

  it("returns what findMany returns", async () => {
    const fakeData = [{ id: "1", title: "Test Work" }];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getLibraryWorksServerFn();
    expect(result).toBe(fakeData);
  });
});
