import { pathToFileURL } from "node:url";
import IORedis from "ioredis";
import { type Job, Worker } from "bullmq";
import { db } from "@bookhouse/db";
import { hashFileAsset, matchFileAssetToEdition, parseFileAssetMetadata, processCoverForWorkDefault, scanLibraryRoot, type ScanProgressData, enrichWork, searchOpenLibrary, getOpenLibraryWork, RateLimiter, type EnrichWorkDeps } from "@bookhouse/ingest";
import {
  LIBRARY_JOB_NAMES,
  type BaseJobPayload,
  type HashFileAssetJobPayload,
  type LibraryJobName,
  type LibraryJobPayload,
  type MatchFileAssetToEditionJobPayload,
  type ParseFileAssetMetadataJobPayload,
  type ProcessCoverJobPayload,
  type RefreshMetadataJobPayload,
  QUEUES,
  type ScanLibraryRootJobPayload,
  createLogger,
  getQueueConnectionConfig,
} from "@bookhouse/shared";

const logger = createLogger("library-worker");

const processCoverForWork = processCoverForWorkDefault(db);
const rateLimiter = new RateLimiter();

export interface LibraryWorkerHandlers {
  hashFileAsset: typeof hashFileAsset;
  matchFileAssetToEdition: typeof matchFileAssetToEdition;
  parseFileAssetMetadata: typeof parseFileAssetMetadata;
  processCoverForWork: (input: { workId: string; fileAssetId: string; coverCacheDir: string }) => Promise<unknown>;
  scanLibraryRoot: typeof scanLibraryRoot;
  enrichWork: typeof enrichWork;
}

function dispatch(
  handlers: LibraryWorkerHandlers,
  job: Job<LibraryJobPayload<LibraryJobName>, unknown, LibraryJobName>,
) {
  const importJobId = (job.data as BaseJobPayload).importJobId;

  switch (job.name) {
    case LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT: {
      const payload = job.data as ScanLibraryRootJobPayload;
      if (importJobId) {
        const reportProgress = async (data: ScanProgressData) => {
          await db.importJob.update({
            where: { id: importJobId },
            data,
          });
          await job.updateProgress(data);
        };
        return handlers.scanLibraryRoot({ ...payload, reportProgress });
      }
      return handlers.scanLibraryRoot(payload);
    }
    case LIBRARY_JOB_NAMES.HASH_FILE_ASSET:
      return handlers.hashFileAsset(job.data as HashFileAssetJobPayload);
    case LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION:
      return handlers.matchFileAssetToEdition(job.data as MatchFileAssetToEditionJobPayload);
    case LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA:
      return handlers.parseFileAssetMetadata(job.data as ParseFileAssetMetadataJobPayload);
    case LIBRARY_JOB_NAMES.PROCESS_COVER: {
      const coverPayload = job.data as ProcessCoverJobPayload;
      return handlers.processCoverForWork({
        workId: coverPayload.workId,
        fileAssetId: coverPayload.fileAssetId,
        coverCacheDir: process.env.COVER_CACHE_DIR ?? "/data/covers",
      });
    }
    case LIBRARY_JOB_NAMES.REFRESH_METADATA: {
      const refreshPayload = job.data as RefreshMetadataJobPayload;
      const deps: EnrichWorkDeps = {
        findWork: (workId) =>
          db.work.findUnique({
            where: { id: workId },
            include: {
              editions: {
                include: {
                  contributors: { include: { contributor: true } },
                  externalLinks: true,
                },
              },
            },
          }),
        searchOL: (title, author) => searchOpenLibrary(title, author, fetch),
        getOLWork: (olid) => getOpenLibraryWork(olid, fetch),
        upsertExternalLink: (data) =>
          db.externalLink.upsert({
            where: {
              editionId_provider_externalId: {
                editionId: data.editionId,
                provider: data.provider,
                externalId: data.externalId,
              },
            },
            create: { ...data, metadata: data.metadata as object, lastSyncedAt: new Date() },
            update: { metadata: data.metadata as object, lastSyncedAt: new Date() },
          }),
        checkRateLimit: () => rateLimiter.check(),
      };
      return handlers.enrichWork(refreshPayload.workId, deps);
    }
    default:
      throw new Error(`Unsupported library job: ${String(job.name)}`);
  }
}

export function createLibraryWorkerProcessor(
  handlers: LibraryWorkerHandlers = {
    hashFileAsset,
    matchFileAssetToEdition,
    parseFileAssetMetadata,
    processCoverForWork,
    scanLibraryRoot,
    enrichWork,
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
    processCoverForWork,
    scanLibraryRoot,
    enrichWork,
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
