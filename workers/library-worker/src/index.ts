import { pathToFileURL } from "node:url";
import IORedis from "ioredis";
import { Job, Worker } from "bullmq";
import {
  detectDuplicates,
  hashFileAsset,
  matchFileAssetToEdition,
  parseFileAssetMetadata,
  scanLibraryRoot,
} from "@bookhouse/ingest";
import {
  type DetectDuplicatesJobPayload,
  LIBRARY_JOB_NAMES,
  type HashFileAssetJobPayload,
  type LibraryJobName,
  type LibraryJobPayload,
  type MatchFileAssetToEditionJobPayload,
  type ParseFileAssetMetadataJobPayload,
  QUEUES,
  type ScanLibraryRootJobPayload,
  getQueueConnectionConfig,
} from "@bookhouse/shared";

export interface LibraryWorkerHandlers {
  detectDuplicates: typeof detectDuplicates;
  hashFileAsset: typeof hashFileAsset;
  matchFileAssetToEdition: typeof matchFileAssetToEdition;
  parseFileAssetMetadata: typeof parseFileAssetMetadata;
  scanLibraryRoot: typeof scanLibraryRoot;
}

export function createLibraryWorkerProcessor(
  handlers: LibraryWorkerHandlers = {
    detectDuplicates,
    hashFileAsset,
    matchFileAssetToEdition,
    parseFileAssetMetadata,
    scanLibraryRoot,
  },
) {
  return async (
    job: Job<LibraryJobPayload<LibraryJobName>, unknown, LibraryJobName>,
  ) => {
    switch (job.name) {
      case LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT:
        return handlers.scanLibraryRoot(job.data as ScanLibraryRootJobPayload);
      case LIBRARY_JOB_NAMES.HASH_FILE_ASSET:
        return handlers.hashFileAsset(job.data as HashFileAssetJobPayload);
      case LIBRARY_JOB_NAMES.DETECT_DUPLICATES:
        return handlers.detectDuplicates(job.data as DetectDuplicatesJobPayload);
      case LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION:
        return handlers.matchFileAssetToEdition(job.data as MatchFileAssetToEditionJobPayload);
      case LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA:
        return handlers.parseFileAssetMetadata(job.data as ParseFileAssetMetadataJobPayload);
      default:
        throw new Error(`Unsupported library job: ${job.name}`);
    }
  };
}

export function createLibraryWorker(
  handlers: LibraryWorkerHandlers = {
    detectDuplicates,
    hashFileAsset,
    matchFileAssetToEdition,
    parseFileAssetMetadata,
    scanLibraryRoot,
  },
) {
  const connection = new IORedis(getQueueConnectionConfig());
  const worker = new Worker(
    QUEUES.LIBRARY,
    createLibraryWorkerProcessor(handlers),
    { connection },
  );

  return { connection, worker };
}

export async function shutdownLibraryWorker(
  worker: Pick<Worker, "close">,
  connection: Pick<IORedis, "quit">,
): Promise<void> {
  await worker.close();
  await connection.quit();
}

export async function bootstrapLibraryWorker(): Promise<void> {
  const { connection, worker } = createLibraryWorker();

  worker.on("ready", () => console.log("Worker ready, waiting for jobs..."));
  worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
  worker.on("failed", (job, error) =>
    console.error(`Job ${job?.id} failed:`, error.message),
  );

  const shutdown = async () => {
    console.log("Shutting down worker...");
    await shutdownLibraryWorker(worker, connection);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`library-worker listening on queue "${QUEUES.LIBRARY}"`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void bootstrapLibraryWorker();
}
