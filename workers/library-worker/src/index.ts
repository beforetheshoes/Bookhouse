import { pathToFileURL } from "node:url";
import IORedis from "ioredis";
import { type Job, Worker } from "bullmq";
import { db } from "@bookhouse/db";
import { hashFileAsset, matchFileAssetToEdition, parseFileAssetMetadata, scanLibraryRoot } from "@bookhouse/ingest";
import {
  LIBRARY_JOB_NAMES,
  type BaseJobPayload,
  type HashFileAssetJobPayload,
  type LibraryJobName,
  type LibraryJobPayload,
  type MatchFileAssetToEditionJobPayload,
  type ParseFileAssetMetadataJobPayload,
  QUEUES,
  type ScanLibraryRootJobPayload,
  createLogger,
  getQueueConnectionConfig,
} from "@bookhouse/shared";

const logger = createLogger("library-worker");

export interface LibraryWorkerHandlers {
  hashFileAsset: typeof hashFileAsset;
  matchFileAssetToEdition: typeof matchFileAssetToEdition;
  parseFileAssetMetadata: typeof parseFileAssetMetadata;
  scanLibraryRoot: typeof scanLibraryRoot;
}

function dispatch(
  handlers: LibraryWorkerHandlers,
  job: Job<LibraryJobPayload<LibraryJobName>, unknown, LibraryJobName>,
) {
  switch (job.name) {
    case LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT:
      return handlers.scanLibraryRoot(job.data as ScanLibraryRootJobPayload);
    case LIBRARY_JOB_NAMES.HASH_FILE_ASSET:
      return handlers.hashFileAsset(job.data as HashFileAssetJobPayload);
    case LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION:
      return handlers.matchFileAssetToEdition(job.data as MatchFileAssetToEditionJobPayload);
    case LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA:
      return handlers.parseFileAssetMetadata(job.data as ParseFileAssetMetadataJobPayload);
    default:
      throw new Error(`Unsupported library job: ${String(job.name)}`);
  }
}

export function createLibraryWorkerProcessor(
  handlers: LibraryWorkerHandlers = {
    hashFileAsset,
    matchFileAssetToEdition,
    parseFileAssetMetadata,
    scanLibraryRoot,
  },
) {
  return async (
    job: Job<LibraryJobPayload<LibraryJobName>, unknown, LibraryJobName>,
  ) => {
    const importJobId = (job.data as BaseJobPayload).importJobId;

    if (importJobId) {
      await db.importJob.update({
        where: { id: importJobId },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          attemptsMade: job.attemptsMade,
        },
      });
    }

    try {
      const result = await dispatch(handlers, job);

      if (importJobId) {
        await db.importJob.update({
          where: { id: importJobId },
          data: { status: "SUCCEEDED", finishedAt: new Date() },
        });
      }

      return result;
    } catch (error) {
      if (importJobId) {
        await db.importJob.update({
          where: { id: importJobId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            error: error instanceof Error ? error.message : String(error),
            attemptsMade: job.attemptsMade,
          },
        });
      }
      throw error;
    }
  };
}

export function createLibraryWorker(
  handlers: LibraryWorkerHandlers = {
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
    {
      connection,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
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

export function bootstrapLibraryWorker(): void {
  const { connection, worker } = createLibraryWorker();

  worker.on("ready", () => { logger.info("Worker ready, waiting for jobs"); });
  worker.on("completed", (job) => { logger.info({ jobId: job.id, jobName: job.name }, "Job completed"); });
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err: error }, "Job failed");
  });

  const shutdown = async () => {
    logger.info("Shutting down worker");
    await shutdownLibraryWorker(worker, connection);
    process.exit(0);
  };

  process.on("SIGINT", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });

  logger.info({ queue: QUEUES.LIBRARY }, "library-worker listening");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrapLibraryWorker();
}
