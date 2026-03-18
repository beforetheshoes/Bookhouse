import { describe, expect, it } from "vitest";
import {
  DetectDuplicatesJobPayload,
  HashFileAssetJobPayload,
  LIBRARY_JOB_NAMES,
  MatchFileAssetToEditionJobPayload,
  ParseFileAssetMetadataJobPayload,
  QUEUES,
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
    expect(LIBRARY_JOB_NAMES.DETECT_DUPLICATES).toBe("detect-duplicates");
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
    const detectPayload: DetectDuplicatesJobPayload = {
      editionId: "edition-1",
      fileAssetId: "file-1",
    };

    expect(scanPayload).toEqual({ libraryRootId: "root-1" });
    expect(hashPayload).toEqual({
      fileAssetId: "file-1",
      forceFullHash: true,
    });
    expect(parsePayload).toEqual({ fileAssetId: "file-1" });
    expect(matchPayload).toEqual({ fileAssetId: "file-1" });
    expect(detectPayload).toEqual({
      editionId: "edition-1",
      fileAssetId: "file-1",
    });
  });
});
