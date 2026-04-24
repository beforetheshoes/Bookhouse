import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";

const {
  mockReadBody,
  mockFindCredential,
  mockVerifyPassword,
  mockResolveKoreaderDocument,
  mockFindFirst,
  mockCreate,
  mockUpdate,
  mockEditionFileFindMany,
  mockFileAssetUpdate,
} = vi.hoisted(() => ({
  mockReadBody: vi.fn(),
  mockFindCredential: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockResolveKoreaderDocument: vi.fn(),
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
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
    readBody: mockReadBody,
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
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

vi.mock("@bookhouse/opds", () => ({
  verifyPassword: mockVerifyPassword,
}));

vi.mock("./shared", async () => {
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
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValue({ updatedAt: new Date("2024-07-01T12:00:00.000Z") });
  });

  it("wires the module default handler through auth, resolution, and create", async () => {
    const result = await handler({
      _headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
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
    expect(result).toEqual({
      document: "abcd1234",
      timestamp: 1719835200,
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        editionId: "ed-1",
        progressKind: "EBOOK",
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
        source: "koreader",
        updatedAt: new Date("2024-07-01T12:00:00.000Z"),
      },
      select: { updatedAt: true },
    });
  });

  it("updates an existing koreader record when one already exists", async () => {
    mockFindFirst.mockReset();
    mockFindFirst.mockResolvedValueOnce({
      updatedAt: new Date("2024-06-01T12:00:00.000Z"),
    });
    mockFindFirst.mockResolvedValueOnce({
      id: "rp-1",
    });
    mockUpdate.mockResolvedValue({ updatedAt: new Date("2024-07-01T12:00:00.000Z") });

    await handler({
      _headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
      },
    } as unknown as H3Event);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "rp-1" },
      data: {
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
        source: "koreader",
        updatedAt: new Date("2024-07-01T12:00:00.000Z"),
      },
      select: { updatedAt: true },
    });
  });

  it("falls back to an empty object when readBody returns null", async () => {
    mockReadBody.mockResolvedValueOnce(null);

    await expect(handler({
      _headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
      },
    } as unknown as H3Event)).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
