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
vi.mock("@bookhouse/db", () => ({
  db: { audioLink: { findMany: findManyMock } },
}));

import { getAudioLinksServerFn } from "./audio-links";

describe("getAudioLinksServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("calls db.audioLink.findMany with correct includes and orderBy confidence desc", async () => {
    findManyMock.mockResolvedValue([]);
    await getAudioLinksServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      include: {
        ebookEdition: {
          include: {
            work: true,
            contributors: { include: { contributor: true } },
          },
        },
        audioEdition: {
          include: {
            work: true,
            contributors: { include: { contributor: true } },
          },
        },
      },
      orderBy: { confidence: "desc" },
    });
  });

  it("returns the result from findMany", async () => {
    const fakeData = [{ id: "al-1", confidence: 0.95 }];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getAudioLinksServerFn();
    expect(result).toBe(fakeData);
  });
});
