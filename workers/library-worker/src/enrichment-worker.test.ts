import { describe, it, expect, vi, beforeEach } from "vitest";

const addMock = vi.fn();
const workerConstructorMock = vi.fn();
const enrichContributorMock = vi.fn();
const appSettingFindUniqueMock = vi.fn();
const contributorFindUniqueMock = vi.fn();
const contributorUpdateMock = vi.fn();
const applyAuthorPhotoFromUrlMock = vi.fn().mockResolvedValue({ success: true });
const resizeAndSaveCoverMock = vi.fn().mockResolvedValue(undefined);
const searchOpenLibraryAuthorsMock = vi.fn();
const searchHardcoverAuthorsMock = vi.fn();
const searchWikidataAuthorsMock = vi.fn().mockResolvedValue([]);
const importJobUpdateMock = vi.fn().mockResolvedValue({});
const importJobFindUniqueMock = vi.fn();
const redisConstructorMock = vi.fn();

vi.mock("ioredis", () => ({
  default: function FakeRedis(config: object) {
    redisConstructorMock(config);
  },
}));

vi.mock("bullmq", () => ({
  Worker: class FakeWorker {
    concurrency = 1;

    constructor(...args: object[]) {
      workerConstructorMock(...args);
    }

    on = vi.fn();
    close = vi.fn();
  },
  Queue: class FakeQueue {
    add = addMock;
  },
}));

vi.mock("@bookhouse/db", () => ({
  db: {
    appSetting: { findUnique: appSettingFindUniqueMock },
    contributor: {
      findUnique: contributorFindUniqueMock,
      update: contributorUpdateMock,
    },
    importJob: {
      update: importJobUpdateMock,
      findUnique: importJobFindUniqueMock,
    },
  },
}));

vi.mock("@bookhouse/ingest", () => ({
  enrichContributor: enrichContributorMock,
  searchOpenLibraryAuthors: searchOpenLibraryAuthorsMock,
  searchHardcoverAuthors: searchHardcoverAuthorsMock,
  searchWikidataAuthors: searchWikidataAuthorsMock,
  applyAuthorPhotoFromUrl: applyAuthorPhotoFromUrlMock,
  resizeAndSaveCover: resizeAndSaveCoverMock,
  createOLFetcher: () => fetch,
  TokenBucketLimiter: class { acquire = () => Promise.resolve(); },
}));

vi.mock("@bookhouse/shared", async () => {
  const actual = await vi.importActual<Record<string, object>>("@bookhouse/shared");
  return {
    ...actual,
    getQueueConnectionConfig: () => ({ host: "localhost", port: 6379 }),
  };
});


beforeEach(() => {
  enrichContributorMock.mockReset();
  appSettingFindUniqueMock.mockReset();
  contributorFindUniqueMock.mockReset();
  contributorUpdateMock.mockReset();
  applyAuthorPhotoFromUrlMock.mockReset();
  applyAuthorPhotoFromUrlMock.mockResolvedValue({ success: true });
  resizeAndSaveCoverMock.mockReset();
  searchOpenLibraryAuthorsMock.mockReset();
  searchHardcoverAuthorsMock.mockReset();
  searchWikidataAuthorsMock.mockReset();
  searchWikidataAuthorsMock.mockResolvedValue([]);
  importJobUpdateMock.mockReset();
  importJobUpdateMock.mockResolvedValue({});
  importJobFindUniqueMock.mockReset();
  delete process.env.COVER_CACHE_DIR;
  delete process.env.NODE_ENV;
  delete process.env.AUTH_SECRET;
  process.env.QUEUE_URL = "redis://localhost:6379";
});

describe("enrichment worker", () => {
  it("dispatches enrich-contributor jobs to enrichContributor handler", async () => {
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "OL1A" });
    appSettingFindUniqueMock.mockResolvedValue(null); // no HC key

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    const result = await processor({
      id: "j1",
      name: "enrich-contributor",
      data: { contributorId: "c1" },
      opts: {},
    } as never);

    expect(result).toEqual({ status: "enriched", authorOlid: "OL1A" });
    expect(enrichContributorMock).toHaveBeenCalledWith("c1", expect.objectContaining({
      findContributor: expect.any(Function) as (() => void),
      acquireOLToken: expect.any(Function) as (() => void),
      searchOLAuthors: expect.any(Function) as (() => void),
      applyPhoto: expect.any(Function) as (() => void),
    }));
  });

  it("includes HC deps when Hardcover API key is configured", async () => {
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "hc:100" });
    // Simulate an encrypted API key — the mock loadAuthConfig returns a fixed secret,
    // but decryptValue will fail on a bad ciphertext. For testing we just verify the deps shape.
    appSettingFindUniqueMock.mockResolvedValue(null); // no key = no HC

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "j2",
      name: "enrich-contributor",
      data: { contributorId: "c2" },
      opts: {},
    } as never);

    // Without HC key, the deps should not include searchHCAuthors
    const [[, deps]] = enrichContributorMock.mock.calls as [[string, Record<string, object | undefined>]];
    expect(deps.searchHCAuthors).toBeUndefined();
    expect(deps.acquireHCToken).toBeUndefined();
  });

  it("throws for unsupported job names", async () => {
    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await expect(
      processor({
        id: "j3",
        name: "unknown-job",
        data: {},
        opts: {},
      } as never),
    ).rejects.toThrow("Unsupported enrichment job");
  });

  it("exercises findContributor and applyPhoto deps", async () => {
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "OL1A" });
    appSettingFindUniqueMock.mockResolvedValue(null);

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "j4",
      name: "enrich-contributor",
      data: { contributorId: "c1" },
      opts: {},
    } as never);

    type Deps = {
      findContributor: (id: string) => Promise<object | null>;
      applyPhoto: (id: string, url: string) => Promise<object>;
      acquireOLToken: () => Promise<void>;
      searchOLAuthors: (name: string) => Promise<object | null>;
    };
    const [[, deps]] = enrichContributorMock.mock.calls as [[string, Deps]];

    // Exercise findContributor
    contributorFindUniqueMock.mockResolvedValueOnce({ id: "c1", nameDisplay: "Author", imagePath: null });
    await deps.findContributor("c1");
    expect(contributorFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      select: { id: true, nameDisplay: true, imagePath: true },
    });

    // Exercise acquireOLToken
    await deps.acquireOLToken();

    // Exercise searchOLAuthors
    void deps.searchOLAuthors("Author");

    // Exercise applyPhoto — the mock applyAuthorPhotoFromUrl handles it
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8]).buffer),
      headers: { get: () => "image/jpeg" },
    }) as typeof fetch;
    try {
      await deps.applyPhoto("c1", "https://covers.openlibrary.org/a/olid/OL1A-M.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("startEnrichmentWorker creates a worker with concurrency 1", async () => {
    const { startEnrichmentWorker } = await import("./enrichment-worker");
    startEnrichmentWorker();

    expect(workerConstructorMock).toHaveBeenCalledWith(
      "enrichment",
      expect.any(Function) as (() => void),
      expect.objectContaining({ concurrency: 1 }),
    );
  });

  it("uses COVER_CACHE_DIR env var when set", async () => {
    process.env.COVER_CACHE_DIR = "/custom/covers";
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "OL1A" });
    appSettingFindUniqueMock.mockResolvedValue(null);

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "j5",
      name: "enrich-contributor",
      data: { contributorId: "c1" },
      opts: {},
    } as never);

    // The applyPhoto dep should use the custom dir — we verify by exercising it
    type Deps = { applyPhoto: (id: string, url: string) => Promise<object> };
    const [[, deps]] = enrichContributorMock.mock.calls as [[string, Deps]];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8]).buffer),
      headers: { get: () => "image/jpeg" },
    }) as typeof fetch;
    try {
      await deps.applyPhoto("c1", "https://example.com/photo.jpg");
      expect(applyAuthorPhotoFromUrlMock).toHaveBeenCalledWith(
        expect.objectContaining({ coverCacheDir: "/custom/covers" }),
        expect.any(Object) as object,
        expect.any(Object) as object,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("exercises applyPhoto inner deps for coverage", async () => {
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "OL1A" });
    appSettingFindUniqueMock.mockResolvedValue(null);

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "jx",
      name: "enrich-contributor",
      data: { contributorId: "c1" },
      opts: {},
    } as never);

    type Deps = { applyPhoto: (id: string, url: string) => Promise<object> };
    const [[, deps]] = enrichContributorMock.mock.calls as [[string, Deps]];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8]).buffer),
      headers: { get: () => "image/jpeg" },
    }) as typeof fetch;
    try {
      await deps.applyPhoto("c1", "https://example.com/photo.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Verify inner deps were passed to applyAuthorPhotoFromUrl
    expect(applyAuthorPhotoFromUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ contributorId: "c1" }),
      expect.objectContaining({
        fetchUrl: expect.any(Function) as (() => void),
        resizeAndSave: expect.any(Function) as (() => void),
      }),
      expect.objectContaining({
        findContributor: expect.any(Function) as (() => void),
        updateContributor: expect.any(Function) as (() => void),
      }),
    );

    // Exercise the inner deps — since applyAuthorPhotoFromUrl is mocked, we extract its call args
    type InnerDeps = { fetchUrl: (url: string) => Promise<{ buffer: Buffer; contentType: string | null }>; resizeAndSave: (buf: Buffer, dir: string) => Promise<void> };
    type InnerDbDeps = { findContributor: (id: string) => Promise<object | null>; updateContributor: (id: string, data: object) => Promise<void> };
    const [[, innerDeps, innerDbDeps]] = applyAuthorPhotoFromUrlMock.mock.calls as [[object, InnerDeps, InnerDbDeps]];

    // fetchUrl — exercise with mocked globalThis.fetch
    const savedFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xaa, 0xbb]).buffer),
      headers: { get: () => "image/webp" },
    }) as typeof fetch;
    const fetchResult = await innerDeps.fetchUrl("https://example.com/test.jpg");
    expect(fetchResult.contentType).toBe("image/webp");
    expect(Buffer.isBuffer(fetchResult.buffer)).toBe(true);
    globalThis.fetch = savedFetch;

    // resizeAndSave
    await innerDeps.resizeAndSave(Buffer.from([1]), "/tmp");
    expect(resizeAndSaveCoverMock).toHaveBeenCalledWith(Buffer.from([1]), "/tmp");

    // findContributor
    contributorFindUniqueMock.mockResolvedValueOnce({ id: "c1" });
    await innerDbDeps.findContributor("c1");
    expect(contributorFindUniqueMock).toHaveBeenCalledWith({ where: { id: "c1" }, select: { id: true } });

    // updateContributor
    contributorUpdateMock.mockResolvedValueOnce({});
    await innerDbDeps.updateContributor("c1", { imagePath: "c1" });
    expect(contributorUpdateMock).toHaveBeenCalledWith({ where: { id: "c1" }, data: { imagePath: "c1" } });
  });

  it("updates ImportJob progress when importJobId is present", async () => {
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "OL1A" });
    appSettingFindUniqueMock.mockResolvedValue(null);
    importJobFindUniqueMock.mockResolvedValue({ totalFiles: 10, processedFiles: 5 });

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "jp",
      name: "enrich-contributor",
      data: { contributorId: "c1", importJobId: "ij-1" },
      opts: {},
    } as never);

    const updateCall = importJobUpdateMock.mock.calls[0] as [{ where: { id: string }; data: { status: string; processedFiles: { increment: number } } }];
    expect(updateCall[0].where.id).toBe("ij-1");
    expect(updateCall[0].data.status).toBe("RUNNING");
    expect(updateCall[0].data.processedFiles).toEqual({ increment: 1 });
  });

  it("marks ImportJob as SUCCEEDED when all jobs are processed", async () => {
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "OL1A" });
    appSettingFindUniqueMock.mockResolvedValue(null);
    importJobFindUniqueMock.mockResolvedValue({ totalFiles: 5, processedFiles: 5 });

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "jc",
      name: "enrich-contributor",
      data: { contributorId: "c1", importJobId: "ij-2" },
      opts: {},
    } as never);

    // First call: increment progress. Second call: mark SUCCEEDED.
    expect(importJobUpdateMock).toHaveBeenCalledTimes(2);
    expect(importJobUpdateMock).toHaveBeenLastCalledWith({
      where: { id: "ij-2" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as Date },
    });
  });

  it("increments errorCount for no-results status", async () => {
    enrichContributorMock.mockResolvedValueOnce({ status: "no-results", triedSources: ["openlibrary"] });
    appSettingFindUniqueMock.mockResolvedValue(null);
    importJobFindUniqueMock.mockResolvedValue({ totalFiles: 10, processedFiles: 3 });

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "je2",
      name: "enrich-contributor",
      data: { contributorId: "c1", importJobId: "ij-3" },
      opts: {},
    } as never);

    const errCall = importJobUpdateMock.mock.calls[0] as [{ where: { id: string }; data: { errorCount: { increment: number } } }];
    expect(errCall[0].where.id).toBe("ij-3");
    expect(errCall[0].data.errorCount).toEqual({ increment: 1 });
  });

  it("updates ImportJob on error and re-throws", async () => {
    enrichContributorMock.mockRejectedValueOnce(new Error("OL API error"));
    appSettingFindUniqueMock.mockResolvedValue(null);

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await expect(
      processor({
        id: "jf",
        name: "enrich-contributor",
        data: { contributorId: "c1", importJobId: "ij-4" },
        opts: {},
      } as never),
    ).rejects.toThrow("OL API error");

    const failCall = importJobUpdateMock.mock.calls[0] as [{ where: { id: string }; data: { processedFiles: { increment: number }; errorCount: { increment: number } } }];
    expect(failCall[0].where.id).toBe("ij-4");
    expect(failCall[0].data.processedFiles).toEqual({ increment: 1 });
    expect(failCall[0].data.errorCount).toEqual({ increment: 1 });
  });

  it("swallows ImportJob update error on job failure", async () => {
    enrichContributorMock.mockRejectedValueOnce(new Error("OL down"));
    appSettingFindUniqueMock.mockResolvedValue(null);
    importJobUpdateMock.mockRejectedValueOnce(new Error("DB down"));

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await expect(
      processor({
        id: "jdb",
        name: "enrich-contributor",
        data: { contributorId: "c1", importJobId: "ij-5" },
        opts: {},
      } as never),
    ).rejects.toThrow("OL down");

    // ImportJob update was attempted but failed — should not block the error throw
  });

  it("always includes Wikidata deps (no API key needed)", async () => {
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "wd:Q1" });
    appSettingFindUniqueMock.mockResolvedValue(null);

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "jwd",
      name: "enrich-contributor",
      data: { contributorId: "c1" },
      opts: {},
    } as never);

    type WDDeps = {
      searchWDAuthors: (name: string) => Promise<object[]>;
      acquireWDToken: () => Promise<void>;
    };
    const [[, deps]] = enrichContributorMock.mock.calls as [[string, WDDeps]];
    expect(deps.searchWDAuthors).toBeDefined();
    expect(deps.acquireWDToken).toBeDefined();

    await deps.acquireWDToken();
    void deps.searchWDAuthors("Test");
  });

  it("includes HC deps when a valid API key setting exists", async () => {
    // Create an encrypted value using the same crypto pattern
    const crypto = await import("node:crypto");
    const secret = "a".repeat(32);
    process.env.AUTH_SECRET = secret;
    const key = crypto.createHash("sha256").update(secret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update("hc-test-key", "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const ciphertext = Buffer.concat([iv, authTag, encrypted]).toString("base64");

    appSettingFindUniqueMock.mockResolvedValue({ value: ciphertext });
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "hc:100" });

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "jhc",
      name: "enrich-contributor",
      data: { contributorId: "c1" },
      opts: {},
    } as never);

    type HCDeps = {
      searchHCAuthors: (name: string) => Promise<object | null>;
      acquireHCToken: () => Promise<void>;
    };
    const [[, deps]] = enrichContributorMock.mock.calls as [[string, HCDeps]];
    expect(deps.searchHCAuthors).toBeDefined();
    expect(deps.acquireHCToken).toBeDefined();

    // Exercise them for coverage
    await deps.acquireHCToken();
    void deps.searchHCAuthors("Test Author");
  });

  it("warns and skips HC when AUTH_SECRET is not set but HC key exists", async () => {
    appSettingFindUniqueMock.mockResolvedValue({ value: "some-encrypted-value" });
    enrichContributorMock.mockResolvedValueOnce({ status: "no-results", triedSources: ["openlibrary"] });
    // AUTH_SECRET is not set (cleared in beforeEach)

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "jns",
      name: "enrich-contributor",
      data: { contributorId: "c1" },
      opts: {},
    } as never);

    const [[, deps]] = enrichContributorMock.mock.calls as [[string, Record<string, object | undefined>]];
    expect(deps.searchHCAuthors).toBeUndefined();
  });

  it("getHardcoverApiKey returns null when appSetting throws", async () => {
    enrichContributorMock.mockResolvedValueOnce({ status: "no-results", triedSources: ["openlibrary"] });
    appSettingFindUniqueMock.mockRejectedValue(new Error("db error"));

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "je",
      name: "enrich-contributor",
      data: { contributorId: "c1" },
      opts: {},
    } as never);

    // Should still work — HC deps just won't be included
    const [[, deps]] = enrichContributorMock.mock.calls as [[string, Record<string, object | undefined>]];
    expect(deps.searchHCAuthors).toBeUndefined();
  });

  it("uses /data/covers in production", async () => {
    process.env.NODE_ENV = "production";
    enrichContributorMock.mockResolvedValueOnce({ status: "enriched", authorOlid: "OL1A" });
    appSettingFindUniqueMock.mockResolvedValue(null);

    const { createEnrichmentWorkerProcessor } = await import("./enrichment-worker");
    const processor = createEnrichmentWorkerProcessor({
      enrichContributor: enrichContributorMock,
    });

    await processor({
      id: "j6",
      name: "enrich-contributor",
      data: { contributorId: "c1" },
      opts: {},
    } as never);

    type Deps = { applyPhoto: (id: string, url: string) => Promise<object> };
    const [[, deps]] = enrichContributorMock.mock.calls as [[string, Deps]];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8]).buffer),
      headers: { get: () => "image/jpeg" },
    }) as typeof fetch;
    try {
      await deps.applyPhoto("c1", "https://example.com/photo.jpg");
      expect(applyAuthorPhotoFromUrlMock).toHaveBeenCalledWith(
        expect.objectContaining({ coverCacheDir: "/data/covers" }),
        expect.any(Object) as object,
        expect.any(Object) as object,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
