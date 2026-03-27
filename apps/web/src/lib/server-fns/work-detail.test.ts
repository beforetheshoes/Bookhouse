import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: <T extends Record<string, string | number | boolean | null | string[] | Date | undefined>>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const findUniqueOrThrowMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: { work: { findUniqueOrThrow: findUniqueOrThrowMock } },
}));

import { getWorkDetailServerFn } from "./work-detail";

describe("getWorkDetailServerFn", () => {
  beforeEach(() => {
    findUniqueOrThrowMock.mockReset();
  });

  it("calls db.work.findUniqueOrThrow with correct args", async () => {
    const fakeWork = { id: "work-1", titleDisplay: "Test" };
    findUniqueOrThrowMock.mockResolvedValue(fakeWork);

    const result = await getWorkDetailServerFn({ data: { workId: "work-1" } });

    expect(findUniqueOrThrowMock).toHaveBeenCalledWith({
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

  it("propagates error when work is not found", async () => {
    findUniqueOrThrowMock.mockRejectedValue(new Error("Not found"));

    await expect(
      getWorkDetailServerFn({ data: { workId: "nonexistent" } }),
    ).rejects.toThrow("Not found");
  });
});
