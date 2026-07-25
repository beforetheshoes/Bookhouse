import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";

const {
  mockReadBody,
  mockFindCredential,
  mockVerifyPassword,
  mockResolveKoreaderDocument,
  mockFindFirst,
  mockUpsert,
  mockEditionFileFindMany,
  mockFileAssetUpdate,
} = vi.hoisted(() => ({
  mockReadBody: vi.fn(),
  mockFindCredential: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockResolveKoreaderDocument: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpsert: vi.fn(),
  mockEditionFileFindMany: vi.fn(),
  mockFileAssetUpdate: vi.fn(),
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: H3Event) => object | Promise<object>) => handler,
  readBody: mockReadBody,
  HTTPError: class HTTPError extends Error {
    status: number;
    statusText: string | undefined;
    constructor(opts: { status: number; statusText?: string; message?: string }) {
      super(opts.message ?? opts.statusText);
      this.status = opts.status;
      this.statusText = opts.statusText;
    }
  },
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
      upsert: mockUpsert,
    },
  },
}));

vi.mock("@bookhouse/opds", () => ({
  verifyPassword: mockVerifyPassword,
}));

vi.mock("./shared", () => {
  return {
    resolveKoreaderDocument: mockResolveKoreaderDocument,
    resolveKoreaderTimestamp: (timestamp: number | undefined, fallback: Date) =>
      typeof timestamp === "number" && !Number.isNaN(timestamp)
        ? new Date(timestamp * 1000)
        : fallback,
  };
});

const { default: handler } = await import("./progress");

describe("KOReader progress route default handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadBody.mockResolvedValue({
      document: "abcd1234",
      progress: "epubcfi(/6/2!/4/2/8)",
      percentage: 55,
      device: "KOReader",
      device_id: "device-1",
      timestamp: 1719835200,
    });
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
    mockFindFirst.mockResolvedValueOnce(null);
    mockUpsert.mockResolvedValue({ updatedAt: new Date("2024-07-01T12:00:00.000Z") });
  });

  it("wires the module default handler through auth, resolution, and upsert", async () => {
    const result = await handler({
      req: new Request("http://localhost/", { headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
      } }),
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
    expect(result).toEqual({
      document: "abcd1234",
      timestamp: 1719835200,
    });
    const koreaderLocator = {
      koreader: {
        document: "abcd1234",
        progress: "epubcfi(/6/2!/4/2/8)",
        percentage: 55,
        device: "KOReader",
        deviceId: "device-1",
      },
    };
    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        userId_editionId_progressKind_source: {
          userId: "u1",
          editionId: "ed-1",
          progressKind: "EBOOK",
          source: "koreader",
        },
      },
      create: {
        userId: "u1",
        editionId: "ed-1",
        progressKind: "EBOOK",
        percent: 55,
        locator: koreaderLocator,
        source: "koreader",
        updatedAt: new Date("2024-07-01T12:00:00.000Z"),
      },
      update: {
        percent: 55,
        locator: koreaderLocator,
        updatedAt: new Date("2024-07-01T12:00:00.000Z"),
      },
      select: { updatedAt: true },
    });
  });

  it("upserts when an older koreader record already exists and the device is newer", async () => {
    mockFindFirst.mockReset();
    mockFindFirst.mockResolvedValueOnce({
      updatedAt: new Date("2024-06-01T12:00:00.000Z"),
    });

    await handler({
      req: new Request("http://localhost/", { headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
      } }),
    } as Partial<H3Event> as H3Event);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_editionId_progressKind_source: {
            userId: "u1",
            editionId: "ed-1",
            progressKind: "EBOOK",
            source: "koreader",
          },
        },
      }),
    );
  });

  it("falls back to an empty object when readBody returns null", async () => {
    mockReadBody.mockResolvedValueOnce(null);

    await expect(handler({
      req: new Request("http://localhost/", { headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
      } }),
    } as Partial<H3Event> as H3Event)).rejects.toThrow(expect.objectContaining({ status: 400 }));
  });
});
