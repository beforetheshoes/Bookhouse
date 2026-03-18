import { describe, expect, it } from "vitest";
import {
  HashFileAssetJobPayload,
  LIBRARY_JOB_NAMES,
  MatchFileAssetToEditionJobPayload,
  ParseFileAssetMetadataJobPayload,
  QUEUES,
  RETRY_CONFIG,
  ScanLibraryRootJobPayload,
  getQueueConnectionConfig,
  getQueueUrl,
} from "./index";

describe("shared queue helpers", () => {
  it("returns the configured queue url", () => {
    process.env.QUEUE_URL = "redis://user:pass@localhost:6379/2";

    expect(getQueueUrl()).toBe("redis://user:pass@localhost:6379/2");
    expect(QUEUES.LIBRARY).toBe("library");
    expect(LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT).toBe("scan-library-root");
    expect(LIBRARY_JOB_NAMES.HASH_FILE_ASSET).toBe("hash-file-asset");
    expect(LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA).toBe("parse-file-asset-metadata");
    expect(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION).toBe("match-file-asset-to-edition");
  });

  it("parses redis connection details", () => {
    process.env.QUEUE_URL = "rediss://user:pass@redis.example.com:6380/4";

    expect(getQueueConnectionConfig()).toEqual({
      host: "redis.example.com",
      port: 6380,
      username: "user",
      password: "pass",
      db: 4,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });

  it("throws for missing or unsupported queue configuration", () => {
    delete process.env.QUEUE_URL;
    expect(() => getQueueUrl()).toThrow("QUEUE_URL environment variable is required");

    process.env.QUEUE_URL = "http://localhost:6379";
    expect(() => getQueueConnectionConfig()).toThrow(
      "Unsupported queue protocol: http:",
    );
  });

  it("applies redis defaults when optional parts are absent", () => {
    process.env.QUEUE_URL = "redis://localhost";

    expect(getQueueConnectionConfig()).toEqual({
      host: "localhost",
      port: 6379,
      username: undefined,
      password: undefined,
      db: undefined,
      tls: undefined,
      maxRetriesPerRequest: null,
    });
  });

  it("defines retry config for every library job name", () => {
    const jobNames = Object.values(LIBRARY_JOB_NAMES);
    for (const name of jobNames) {
      const config = RETRY_CONFIG[name];
      expect(config).toBeDefined();
      expect(config.attempts).toBeGreaterThanOrEqual(1);
      expect(["exponential", "fixed"]).toContain(config.backoff.type);
      expect(config.backoff.delay).toBeGreaterThan(0);
    }
  });

  it("uses conservative retry counts for scan jobs", () => {
    expect(RETRY_CONFIG[LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT].attempts).toBe(2);
    expect(RETRY_CONFIG[LIBRARY_JOB_NAMES.HASH_FILE_ASSET].attempts).toBe(3);
  });

  it("defines typed queue payload shapes for library jobs", () => {
    const scanPayload: ScanLibraryRootJobPayload = {
      libraryRootId: "root-1",
    };
    const hashPayload: HashFileAssetJobPayload = {
      fileAssetId: "file-1",
      forceFullHash: true,
    };
    const parsePayload: ParseFileAssetMetadataJobPayload = {
      fileAssetId: "file-1",
    };
    const matchPayload: MatchFileAssetToEditionJobPayload = {
      fileAssetId: "file-1",
    };

    expect(scanPayload).toEqual({ libraryRootId: "root-1" });
    expect(hashPayload).toEqual({
      fileAssetId: "file-1",
      forceFullHash: true,
    });
    expect(parsePayload).toEqual({ fileAssetId: "file-1" });
    expect(matchPayload).toEqual({ fileAssetId: "file-1" });
  });
});
