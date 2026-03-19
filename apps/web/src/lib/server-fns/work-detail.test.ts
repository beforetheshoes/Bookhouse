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
