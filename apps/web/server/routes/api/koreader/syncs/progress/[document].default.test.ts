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

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: H3Event) => object | Promise<object>) => handler,
  createError: (opts: { statusCode: number; statusMessage?: string; message?: string }) =>
    Object.assign(new Error(opts.message), { statusCode: opts.statusCode, statusMessage: opts.statusMessage }),
}));

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

vi.mock("../shared", () => {
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
    mockResolveKoreaderDocument.mockImplementation(async (deps: {
      findExactCandidates: () => Promise<object[]>;
      findUnhashedCandidates: () => Promise<object[]>;
      updateFileAssetHash: (id: string, hash: string) => Promise<void>;
    }) => {
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
      req: new Request("http://localhost/", { headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
      } }),
      context: {
        params: {
          document: "abcd1234",
        },
      },
    } as Partial<H3Event> as H3Event);

    expect(mockFindCredential).toHaveBeenCalledWith({ where: { username: "reader" } });
    expect(mockVerifyPassword).toHaveBeenCalledWith("secret", "salt:hash");
    expect(mockResolveKoreaderDocument).toHaveBeenCalledWith(expect.objectContaining({
      document: "abcd1234",
      updateFileAssetHash: expect.any(Function) as object,
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
