import { pathToFileURL } from "node:url";
import IORedis from "ioredis";
import { type Job, WaitingChildrenError, Worker } from "bullmq";
import { db } from "@bookhouse/db";
import { createIngestServices, matchAudio, matchFileAssetToEdition, parseFileAssetMetadata, processCoverForWorkDefault, scanLibraryRoot, type ScanProgressData, enrichWork, searchOpenLibrary, getOpenLibraryWork, RateLimiter, type EnrichWorkDeps, detectDuplicates, hashFileAsset } from "@bookhouse/ingest";
import {
  LIBRARY_JOB_NAMES,
  type BaseJobPayload,
  type DetectDuplicatesJobPayload,
  type MatchAudioJobPayload,
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
  enqueueLibraryJob,
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
  detectDuplicates: typeof detectDuplicates;
  matchAudio: typeof matchAudio;
}

function createJobHandlers(
  job: Job<LibraryJobPayload<LibraryJobName>, unknown, LibraryJobName>,
): LibraryWorkerHandlers {
  const wrappedEnqueue = async <TName extends LibraryJobName>(
    jobName: TName,
    payload: LibraryJobPayload<TName>,
  ): Promise<void> => {
    await enqueueLibraryJob(jobName, payload, {
      parent: { id: job.id ?? "", queue: job.queueQualifiedName },
      removeDependencyOnFailure: true,
    });
  };

  const services = createIngestServices({ enqueueLibraryJob: wrappedEnqueue });

  return {
    hashFileAsset: services.hashFileAsset,
    matchFileAssetToEdition: services.matchFileAssetToEdition,
    parseFileAssetMetadata: services.parseFileAssetMetadata,
    processCoverForWork,
    scanLibraryRoot: services.scanLibraryRoot,
    enrichWork,
    detectDuplicates: services.detectDuplicates,
    matchAudio: services.matchAudio,
  };
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
    case LIBRARY_JOB_NAMES.DETECT_DUPLICATES:
      return handlers.detectDuplicates(job.data as DetectDuplicatesJobPayload);
    case LIBRARY_JOB_NAMES.MATCH_AUDIO:
      return handlers.matchAudio(job.data as MatchAudioJobPayload);
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
  handlers?: LibraryWorkerHandlers,
) {
  return async (
    job: Job<LibraryJobPayload<LibraryJobName>, unknown, LibraryJobName>,
    token?: string,
  ) => {
    const importJobId = (job.data as BaseJobPayload).importJobId;
    const isScanJob = job.name === LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT;

    // Completion phase — BullMQ re-activated this job after all children finished
    if ((job.data as BaseJobPayload).step === "waiting-children") {
      if (importJobId) {
        await db.importJob.update({
          where: { id: importJobId },
          data: { status: "SUCCEEDED", finishedAt: new Date() },
        });
      }
      return;
    }

    // Only the scan job manages ImportJob lifecycle
    if (importJobId && isScanJob) {
      await db.importJob.update({
        where: { id: importJobId },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          attemptsMade: job.attemptsMade,
        },
      });
    }

    const jobHandlers = handlers ?? createJobHandlers(job);

    try {
      const result = await dispatch(jobHandlers, job);

      // Attempt to wait for any children this job spawned
      await job.updateData({ ...job.data, step: "waiting-children" });
      const shouldWait = await job.moveToWaitingChildren(token ?? "");
      if (shouldWait) {
        throw new WaitingChildrenError();
      }

      // No children (or all already done) — complete immediately
      if (importJobId && isScanJob) {
        await db.importJob.update({
          where: { id: importJobId },
          data: { status: "SUCCEEDED", finishedAt: new Date() },
        });
      }

      return result;
    } catch (error) {
      if (error instanceof WaitingChildrenError) {
        throw error;
      }

      if (importJobId && isScanJob) {
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

const defaultHandlers: LibraryWorkerHandlers = {
  hashFileAsset,
  matchFileAssetToEdition,
  parseFileAssetMetadata,
  processCoverForWork,
  scanLibraryRoot,
  enrichWork,
  detectDuplicates,
  matchAudio,
};

const DEFAULT_WORKER_CONCURRENCY = 5;
const CONCURRENCY_POLL_INTERVAL_MS = 10_000;

export function createLibraryWorker(
  handlers?: LibraryWorkerHandlers,
) {
  const connection = new IORedis(getQueueConnectionConfig());
  const worker = new Worker(
    QUEUES.LIBRARY,
    createLibraryWorkerProcessor(handlers),
    {
      connection,
      concurrency: DEFAULT_WORKER_CONCURRENCY,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  );

  const pollInterval = setInterval(() => {
    void pollConcurrency(worker);
  }, CONCURRENCY_POLL_INTERVAL_MS);

  return { connection, pollInterval, worker };
}

async function pollConcurrency(worker: Pick<Worker, "concurrency">): Promise<void> {
  try {
    const setting = await db.appSetting.findUnique({ where: { key: "workerConcurrency" } });
    const desired = setting ? Number(setting.value) : DEFAULT_WORKER_CONCURRENCY;
    if (!Number.isNaN(desired) && desired >= 1 && desired <= 20 && worker.concurrency !== desired) {
      worker.concurrency = desired;
      logger.info({ concurrency: desired }, "Worker concurrency updated");
    }
  } catch {
    // DB unavailable — keep current concurrency
  }
}

export async function shutdownLibraryWorker(
  worker: Pick<Worker, "close">,
  connection: Pick<IORedis, "quit">,
  pollInterval?: ReturnType<typeof setInterval>,
): Promise<void> {
  if (pollInterval !== undefined) {
    clearInterval(pollInterval);
  }
  await worker.close();
  await connection.quit();
}

export function bootstrapLibraryWorker(): void {
  const { connection, pollInterval, worker } = createLibraryWorker();

  worker.on("ready", () => { logger.info("Worker ready, waiting for jobs"); });
  worker.on("completed", (job) => { logger.info({ jobId: job.id, jobName: job.name }, "Job completed"); });
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err: error }, "Job failed");
  });

  const shutdown = async () => {
    logger.info("Shutting down worker");
    await shutdownLibraryWorker(worker, connection, pollInterval);
    process.exit(0);
  };

  process.on("SIGINT", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });

  logger.info({ queue: QUEUES.LIBRARY }, "library-worker listening");
}

// Coverage: defaultHandlers referenced to ensure the import is exercised
export { defaultHandlers as _defaultHandlers };

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrapLibraryWorker();
}
