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

const findManyMock = vi.fn();
const findUniqueOrThrowMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: {
    series: {
      findMany: findManyMock,
      findUniqueOrThrow: findUniqueOrThrowMock,
    },
  },
}));

import {
  getSeriesListServerFn,
  getSeriesDetailServerFn,
} from "./series";

describe("getSeriesListServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("calls db.series.findMany with correct args", async () => {
    findManyMock.mockResolvedValue([]);
    await getSeriesListServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      include: {
        _count: { select: { works: true } },
        works: { take: 1, select: { coverPath: true } },
      },
      orderBy: { name: "asc" },
    });
  });

  it("returns what findMany returns", async () => {
    const fakeData = [{ id: "s1", name: "Discworld", _count: { works: 41 } }];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getSeriesListServerFn();
    expect(result).toBe(fakeData);
  });
});

describe("getSeriesDetailServerFn", () => {
  beforeEach(() => {
    findUniqueOrThrowMock.mockReset();
  });

  it("calls db.series.findUniqueOrThrow with correct args", async () => {
    const fakeSeries = { id: "s1", name: "Discworld", works: [] };
    findUniqueOrThrowMock.mockResolvedValue(fakeSeries);

    const result = await getSeriesDetailServerFn({
      data: { seriesId: "s1" },
    });

    expect(findUniqueOrThrowMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      include: {
        works: {
          orderBy: { seriesPosition: "asc" },
          include: {
            series: true,
            editions: {
              include: {
                contributors: { include: { contributor: true } },
              },
            },
          },
        },
      },
    });
    expect(result).toBe(fakeSeries);
  });

  it("propagates error when series is not found", async () => {
    findUniqueOrThrowMock.mockRejectedValue(new Error("Not found"));

    await expect(
      getSeriesDetailServerFn({ data: { seriesId: "nonexistent" } }),
    ).rejects.toThrow("Not found");
  });
});
