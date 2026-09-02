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

const findManyMock = vi.fn();
const findUniqueMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: {
    series: {
      findMany: findManyMock,
      findUnique: findUniqueMock,
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
        works: {
          orderBy: { seriesPosition: "asc" },
          select: {
            id: true,
            titleDisplay: true,
            seriesPosition: true,
            editions: {
              select: {
                contributors: {
                  select: {
                    role: true,
                    contributor: {
                      select: { nameDisplay: true },
                    },
                  },
                },
              },
            },
          },
        },
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
    findUniqueMock.mockReset();
  });

  it("calls db.series.findUnique with correct args", async () => {
    const fakeSeries = { id: "s1", name: "Discworld", works: [] };
    findUniqueMock.mockResolvedValue(fakeSeries);

    const result = await getSeriesDetailServerFn({
      data: { seriesId: "s1" },
    });

    expect(findUniqueMock).toHaveBeenCalledWith({
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

  it("returns null when the series is not found, so the route can show a 404", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      getSeriesDetailServerFn({ data: { seriesId: "nonexistent" } }),
    ).resolves.toBeNull();
  });
});
