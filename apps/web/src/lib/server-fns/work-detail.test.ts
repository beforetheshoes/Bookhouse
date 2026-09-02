import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      validator: () => Builder;
      handler: <T extends Record<string, string | number | boolean | null | string[] | Date | undefined>>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      validator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const findUniqueMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: { work: { findUnique: findUniqueMock } },
}));

import { getWorkDetailServerFn } from "./work-detail";

describe("getWorkDetailServerFn", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it("calls db.work.findUnique with correct args", async () => {
    const fakeWork = { id: "work-1", titleDisplay: "Test" };
    findUniqueMock.mockResolvedValue(fakeWork);

    const result = await getWorkDetailServerFn({ data: { workId: "work-1" } });

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "work-1" },
      include: {
        series: true,
        tags: { include: { tag: true } },
        editions: {
          include: {
            contributors: { include: { contributor: true } },
            editionFiles: { include: { fileAsset: true } },
          },
        },
      },
    });
    expect(result).toBe(fakeWork);
  });

  it("returns null when the work is not found, so the route can show a 404", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      getWorkDetailServerFn({ data: { workId: "nonexistent" } }),
    ).resolves.toBeNull();
  });
});
