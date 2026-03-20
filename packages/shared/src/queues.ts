export const QUEUES = {
  LIBRARY: "library",
} as const;

export const LIBRARY_JOB_NAMES = {
  SCAN_LIBRARY_ROOT: "scan-library-root",
  HASH_FILE_ASSET: "hash-file-asset",
  PARSE_FILE_ASSET_METADATA: "parse-file-asset-metadata",
  MATCH_FILE_ASSET_TO_EDITION: "match-file-asset-to-edition",
  PROCESS_COVER: "process-cover",
  REFRESH_METADATA: "refresh-metadata",
  DETECT_DUPLICATES: "detect-duplicates",
} as const;

export interface BaseJobPayload {
  importJobId?: string;
}

export interface ScanLibraryRootJobPayload extends BaseJobPayload {
  libraryRootId: string;
}

export interface HashFileAssetJobPayload extends BaseJobPayload {
  fileAssetId: string;
  forceFullHash?: boolean;
}

export interface ParseFileAssetMetadataJobPayload extends BaseJobPayload {
  fileAssetId: string;
}

export interface MatchFileAssetToEditionJobPayload extends BaseJobPayload {
  fileAssetId: string;
}

export interface ProcessCoverJobPayload extends BaseJobPayload {
  workId: string;
  fileAssetId: string;
}

export interface RefreshMetadataJobPayload extends BaseJobPayload {
  workId: string;
}

export interface DetectDuplicatesJobPayload extends BaseJobPayload {
  fileAssetId: string;
}

export interface LibraryJobPayloads {
  [LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT]: ScanLibraryRootJobPayload;
  [LIBRARY_JOB_NAMES.HASH_FILE_ASSET]: HashFileAssetJobPayload;
  [LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA]: ParseFileAssetMetadataJobPayload;
  [LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION]: MatchFileAssetToEditionJobPayload;
  [LIBRARY_JOB_NAMES.PROCESS_COVER]: ProcessCoverJobPayload;
  [LIBRARY_JOB_NAMES.REFRESH_METADATA]: RefreshMetadataJobPayload;
  [LIBRARY_JOB_NAMES.DETECT_DUPLICATES]: DetectDuplicatesJobPayload;
}

export type LibraryJobName = keyof LibraryJobPayloads;
export type LibraryJobPayload<TName extends LibraryJobName> = LibraryJobPayloads[TName];

export interface JobRetryConfig {
  attempts: number;
  backoff: { type: "exponential" | "fixed"; delay: number };
}

export const RETRY_CONFIG: Record<LibraryJobName, JobRetryConfig> = {
  [LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  },
  [LIBRARY_JOB_NAMES.HASH_FILE_ASSET]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
  [LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
  [LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
  [LIBRARY_JOB_NAMES.PROCESS_COVER]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
  },
  [LIBRARY_JOB_NAMES.REFRESH_METADATA]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  },
  [LIBRARY_JOB_NAMES.DETECT_DUPLICATES]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
  },
};

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
