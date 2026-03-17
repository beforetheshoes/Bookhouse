export const QUEUES = {
  LIBRARY: "library",
} as const;

export const LIBRARY_JOB_NAMES = {
  SCAN_LIBRARY_ROOT: "scan-library-root",
  HASH_FILE_ASSET: "hash-file-asset",
  PARSE_FILE_ASSET_METADATA: "parse-file-asset-metadata",
} as const;

export interface ScanLibraryRootJobPayload {
  libraryRootId: string;
}

export interface HashFileAssetJobPayload {
  fileAssetId: string;
  forceFullHash?: boolean;
}

export interface ParseFileAssetMetadataJobPayload {
  fileAssetId: string;
}

export interface LibraryJobPayloads {
  [LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT]: ScanLibraryRootJobPayload;
  [LIBRARY_JOB_NAMES.HASH_FILE_ASSET]: HashFileAssetJobPayload;
  [LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA]: ParseFileAssetMetadataJobPayload;
}

export type LibraryJobName = keyof LibraryJobPayloads;
export type LibraryJobPayload<TName extends LibraryJobName> = LibraryJobPayloads[TName];

export function getQueueUrl(): string {
  const url = process.env.QUEUE_URL;
  if (!url) {
    throw new Error("QUEUE_URL environment variable is required");
  }
  return url;
}

export function getQueueConnectionConfig() {
  const queueUrl = new URL(getQueueUrl());

  if (queueUrl.protocol !== "redis:" && queueUrl.protocol !== "rediss:") {
    throw new Error(`Unsupported queue protocol: ${queueUrl.protocol}`);
  }

  return {
    host: queueUrl.hostname,
    port: queueUrl.port ? Number(queueUrl.port) : 6379,
    username: queueUrl.username || undefined,
    password: queueUrl.password || undefined,
    db: queueUrl.pathname.length > 1 ? Number(queueUrl.pathname.slice(1)) : undefined,
    tls: queueUrl.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
