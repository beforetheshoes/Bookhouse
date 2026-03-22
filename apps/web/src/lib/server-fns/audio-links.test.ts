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
const updateMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: { audioLink: { findMany: findManyMock, update: updateMock } },
}));

import { getAudioLinksServerFn, confirmAudioLinkServerFn, ignoreAudioLinkServerFn } from "./audio-links";

describe("getAudioLinksServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    updateMock.mockReset();
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
            editionFiles: {
              include: {
                fileAsset: {
                  select: { absolutePath: true, mediaKind: true },
                },
              },
            },
          },
        },
        audioEdition: {
          include: {
            work: true,
            contributors: { include: { contributor: true } },
            editionFiles: {
              include: {
                fileAsset: {
                  select: { absolutePath: true, mediaKind: true },
                },
              },
            },
          },
        },
      },
      orderBy: { confidence: "desc" },
    });
  });

  it("returns only links where audio edition has audio files", async () => {
    const fakeData = [
      {
        id: "al-1",
        confidence: 0.95,
        audioEdition: { editionFiles: [{ fileAsset: { mediaKind: "AUDIO" } }] },
      },
      {
        id: "al-2",
        confidence: 0.90,
        audioEdition: { editionFiles: [{ fileAsset: { mediaKind: "SIDECAR" } }] },
      },
    ];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getAudioLinksServerFn();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("al-1");
  });

  it("returns empty array when all links are sidecar-only", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "al-1",
        audioEdition: { editionFiles: [{ fileAsset: { mediaKind: "SIDECAR" } }] },
      },
    ]);
    const result = await getAudioLinksServerFn();
    expect(result).toHaveLength(0);
  });
});

describe("confirmAudioLinkServerFn", () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it("updates reviewStatus to CONFIRMED", async () => {
    updateMock.mockResolvedValue({});
    const result = await confirmAudioLinkServerFn({ data: { id: "al-1" } });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "al-1" },
      data: { reviewStatus: "CONFIRMED" },
    });
    expect(result).toEqual({ success: true });
  });
});

describe("ignoreAudioLinkServerFn", () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it("updates reviewStatus to IGNORED", async () => {
    updateMock.mockResolvedValue({});
    const result = await ignoreAudioLinkServerFn({ data: { id: "al-1" } });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "al-1" },
      data: { reviewStatus: "IGNORED" },
    });
    expect(result).toEqual({ success: true });
  });
});
