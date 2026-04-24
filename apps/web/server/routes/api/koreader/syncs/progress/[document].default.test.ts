import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";

const {
  mockFindCredential,
  mockVerifyPassword,
  mockResolveKoreaderDocument,
  mockFindFirst,
  mockEditionFileFindMany,
  mockFileAssetUpdate,
} = vi.hoisted(() => ({
  mockFindCredential: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockResolveKoreaderDocument: vi.fn(),
  mockFindFirst: vi.fn(),
  mockEditionFileFindMany: vi.fn(),
  mockFileAssetUpdate: vi.fn(),
}));

vi.mock("h3", async () => {
  const actual = await vi.importActual<typeof import("h3")>("h3");
  return {
    ...actual,
    defineEventHandler: (handler: (event: H3Event) => unknown) => handler,
    getRequestHeader: (event: { _headers?: Record<string, string> }, name: string) =>
      event._headers?.[name.toLowerCase()] ?? null,
  };
});

vi.mock("@bookhouse/db", () => ({
  db: {
    koreaderCredential: {
      findUnique: mockFindCredential,
    },
    editionFile: {
      findMany: mockEditionFileFindMany,
    },
    fileAsset: {
      update: mockFileAssetUpdate,
    },
    readingProgress: {
      findFirst: mockFindFirst,
    },
  },
}));

vi.mock("@bookhouse/opds", () => ({
  verifyPassword: mockVerifyPassword,
}));

vi.mock("../shared", async () => {
  return {
    resolveKoreaderDocument: mockResolveKoreaderDocument,
    resolveKoreaderTimestamp: (timestamp: number | undefined, fallback: Date) =>
      typeof timestamp === "number" && !Number.isNaN(timestamp)
        ? new Date(timestamp * 1000)
        : fallback,
  };
});

const { default: handler } = await import("./[document]");

describe("KOReader progress document route default handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindCredential.mockResolvedValue({
      id: "kc1",
      userId: "u1",
      username: "reader",
      passwordHash: "salt:hash",
      isEnabled: true,
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockEditionFileFindMany.mockResolvedValue([]);
    mockFileAssetUpdate.mockResolvedValue({});
    mockResolveKoreaderDocument.mockImplementation(async (deps) => {
      await deps.findExactCandidates();
      await deps.findUnhashedCandidates();
      await deps.updateFileAssetHash("fa-1", "abcd1234");

      return {
        document: "abcd1234",
        editionId: "ed-1",
        fileAssetId: "fa-1",
      };
    });
    mockFindFirst.mockResolvedValue({
      percent: 55,
      locator: {
        koreader: {
          document: "abcd1234",
          progress: "epubcfi(/6/2!/4/2/8)",
          percentage: 55,
          device: "KOReader",
          deviceId: "device-1",
        },
      },
      updatedAt: new Date("2024-07-01T12:00:00.000Z"),
    });
  });

  it("wires the module default handler through auth, resolution, and lookup", async () => {
    const result = await handler({
      _headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
      },
      context: {
        params: {
          document: "abcd1234",
        },
      },
    } as unknown as H3Event);

    expect(mockFindCredential).toHaveBeenCalledWith({ where: { username: "reader" } });
    expect(mockVerifyPassword).toHaveBeenCalledWith("secret", "salt:hash");
    expect(mockResolveKoreaderDocument).toHaveBeenCalledWith(expect.objectContaining({
      document: "abcd1234",
      updateFileAssetHash: expect.any(Function),
    }));
    expect(mockEditionFileFindMany).toHaveBeenCalledTimes(2);
    expect(mockFileAssetUpdate).toHaveBeenCalledWith({
      where: { id: "fa-1" },
      data: { koreaderHash: "abcd1234" },
    });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: "u1", editionId: "ed-1", progressKind: "EBOOK", source: "koreader" },
      select: {
        percent: true,
        locator: true,
        updatedAt: true,
      },
    });
    expect(result).toEqual({
      document: "abcd1234",
      progress: "epubcfi(/6/2!/4/2/8)",
      percentage: 55,
      device: "KOReader",
      device_id: "device-1",
      timestamp: 1719835200,
    });
  });
});
