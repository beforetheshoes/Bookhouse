import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder: any = {};
    builder.inputValidator = () => builder;
    builder.handler = (fn: Function) => (args: any) => fn(args ?? {});
    return builder;
  },
}));

const findManyMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: { duplicateCandidate: { findMany: findManyMock } },
}));

import { getDuplicatesServerFn } from "./duplicates";

describe("getDuplicatesServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("calls db.duplicateCandidate.findMany with correct includes and orderBy confidence desc", async () => {
    findManyMock.mockResolvedValue([]);
    await getDuplicatesServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      include: {
        leftEdition: {
          include: {
            work: true,
            contributors: { include: { contributor: true } },
          },
        },
        rightEdition: {
          include: {
            work: true,
            contributors: { include: { contributor: true } },
          },
        },
        leftFileAsset: true,
        rightFileAsset: true,
      },
      orderBy: { confidence: "desc" },
    });
  });

  it("returns the result from findMany", async () => {
    const fakeData = [{ id: "dup-1", confidence: 0.99 }];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getDuplicatesServerFn();
    expect(result).toBe(fakeData);
  });
});
