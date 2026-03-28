import { fileURLToPath, pathToFileURL } from "node:url";
import IORedis from "ioredis";
import { type Job, WaitingChildrenError, Worker } from "bullmq";
import { db } from "@bookhouse/db";
import { cascadeCleanupOrphans, createIngestServices, matchSuggestions, matchFileAssetToEdition, parseFileAssetMetadata, processCoverForWorkDefault, scanLibraryRoot, enrichWork, searchOpenLibrary, getOpenLibraryWork, TokenBucketLimiter, createOLFetcher, detectDuplicates, hashFileAsset, type ScanProgressData, type ScanLibraryRootResult, type EnrichWorkDeps, type ProcessCoverResult, type HashFileAssetResult, type ParseFileAssetMetadataResult, type MatchFileAssetToEditionResult, type DetectDuplicatesResult, type MatchSuggestionsResult, type EnrichWorkResult } from "@bookhouse/ingest";
import {
  LIBRARY_JOB_NAMES,
  type BaseJobPayload,
  type DetectDuplicatesJobPayload,
  type MatchSuggestionsJobPayload,
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
const olLimiter = new TokenBucketLimiter(3);
const olFetch = createOLFetcher("bookhouse@teamsnail.org");

export type LibraryJobResult =
  | ScanLibraryRootResult
  | HashFileAssetResult
  | ParseFileAssetMetadataResult
  | MatchFileAssetToEditionResult
  | ProcessCoverResult
  | DetectDuplicatesResult
  | MatchSuggestionsResult
  | EnrichWorkResult
  | undefined;

export type ScanType = "full" | "onDemand" | "incremental";

export const SCAN_CONCURRENCY_DEFAULTS: Record<ScanType, number> = {
  full: 8,
  onDemand: 5,
  incremental: 3,
};

const SCAN_CONCURRENCY_KEYS: Record<ScanType, string> = {
  full: "concurrencyFull",
  onDemand: "concurrencyOnDemand",
  incremental: "concurrencyIncremental",
};

export function deriveScanType(payload: ScanLibraryRootJobPayload): ScanType {
  if (payload.scanMode === "FULL") return "full";
  if (payload.scanTrigger === "scheduled") return "incremental";
  return "onDemand";
}

let activeScanType: ScanType | null = null;

function getCoverCacheDir(): string {
  if (process.env.COVER_CACHE_DIR) {
    return process.env.COVER_CACHE_DIR;
  }

  if (process.env.NODE_ENV === "production") {
    return "/data/covers";
  }

  return fileURLToPath(new URL("../../covers", import.meta.url));
}

export interface LibraryWorkerHandlers {
  hashFileAsset: typeof hashFileAsset;
  matchFileAssetToEdition: typeof matchFileAssetToEdition;
  parseFileAssetMetadata: typeof parseFileAssetMetadata;
  processCoverForWork: (input: { workId: string; fileAssetId: string; coverCacheDir: string }) => Promise<ProcessCoverResult>;
  scanLibraryRoot: typeof scanLibraryRoot;
  enrichWork: typeof enrichWork;
  detectDuplicates: typeof detectDuplicates;
  matchSuggestions: typeof matchSuggestions;
}

function createJobHandlers(
  job: Job<LibraryJobPayload<LibraryJobName>, LibraryJobResult, LibraryJobName>,
): LibraryWorkerHandlers {
  const basePayload = job.data as BaseJobPayload;
  const parentImportJobId = basePayload.importJobId;
  // All descendants register the scan-library-root job as their direct parent,
  // flattening the dependency tree to a single level so BullMQ only needs to
  // resolve one moveToWaitingChildren call on the root scan job.
  const scanJobId = basePayload.scanJobId ?? job.id ?? "";
  const scanQueueName = basePayload.scanQueueName ?? job.queueQualifiedName;
  const wrappedEnqueue = async <TName extends LibraryJobName>(
    jobName: TName,
    payload: LibraryJobPayload<TName>,
  ): Promise<string | undefined> => {
    const enrichedPayload: LibraryJobPayload<TName> = {
      ...payload,
      ...(parentImportJobId ? { importJobId: parentImportJobId } : {}),
      scanJobId,
      scanQueueName,
    } as LibraryJobPayload<TName>;
    return enqueueLibraryJob(jobName, enrichedPayload, {
      parent: { id: scanJobId, queue: scanQueueName },
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
    matchSuggestions: services.matchSuggestions,
  };
}

async function dispatch(
  handlers: LibraryWorkerHandlers,
  job: Job<LibraryJobPayload<LibraryJobName>, LibraryJobResult, LibraryJobName>,
) {
  const importJobId = (job.data as BaseJobPayload).importJobId;

  switch (job.name) {
    case LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT: {
      const payload = job.data as ScanLibraryRootJobPayload;
      activeScanType = deriveScanType(payload);
      let scanResult: ScanLibraryRootResult;
      if (importJobId) {
        const reportProgress = async (data: ScanProgressData) => {
          try {
            await db.importJob.update({
              where: { id: importJobId },
              data,
            });
            await job.updateProgress(data);
          } catch (error) {
            logger.warn(
              { err: error, importJobId, jobId: job.id, progress: data },
              "Failed to persist scan progress",
            );
          }
        };
        scanResult = await handlers.scanLibraryRoot({ ...payload, reportProgress });
      } else {
        scanResult = await handlers.scanLibraryRoot(payload);
      }

      // Auto-cleanup missing files if the setting is enabled
      if (scanResult.missingFileAssetIds.length > 0) {
        const setting = await db.appSetting.findUnique({ where: { key: "missingFileBehavior" } });
        if (setting?.value === "auto-cleanup") {
          await cascadeCleanupOrphans(db, { fileAssetIds: scanResult.missingFileAssetIds });
        }
      }

      return scanResult;
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
        coverCacheDir: getCoverCacheDir(),
      });
    }
    case LIBRARY_JOB_NAMES.DETECT_DUPLICATES:
      return handlers.detectDuplicates(job.data as DetectDuplicatesJobPayload);
    case LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS:
      return handlers.matchSuggestions(job.data as MatchSuggestionsJobPayload);
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
        searchOL: (title, author) => searchOpenLibrary(title, author, olFetch),
        getOLWork: (olid) => getOpenLibraryWork(olid, olFetch),
        upsertExternalLink: async (data) => {
          await db.externalLink.upsert({
            where: {
              editionId_provider_externalId: {
                editionId: data.editionId,
                provider: data.provider,
                externalId: data.externalId,
              },
            },
            create: { ...data, metadata: data.metadata as object, lastSyncedAt: new Date() },
            update: { metadata: data.metadata as object, lastSyncedAt: new Date() },
          });
        },
        acquireOLToken: () => olLimiter.acquire(),
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
    job: Job<LibraryJobPayload<LibraryJobName>, LibraryJobResult, LibraryJobName>,
    token?: string,
  ) => {
  const importJobId = (job.data as BaseJobPayload).importJobId;
  const isScanJob = job.name === LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT;
  const totalAttempts = job.opts.attempts ?? 1;
  const finalAttempt = job.attemptsMade + 1 >= totalAttempts;

  // Completion phase — BullMQ re-activated the scan-root after all children finished.
  // Only scan-root uses the step pattern; other jobs complete in a single pass.
  if ((job.data as BaseJobPayload).step === "waiting-children") {
    logger.info({ jobId: job.id, jobName: job.name }, "All children finished, entering completion phase");
    if (importJobId && isScanJob) {
      await db.importJob.update({
        where: { id: importJobId, status: "RUNNING" },
        data: { status: "SUCCEEDED", finishedAt: new Date(), scanStage: null, bullmqJobId: null },
      });
      logger.info({ jobId: job.id, importJobId }, "Scan marked SUCCEEDED");
    }
    if (isScanJob) activeScanType = null;
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

    // Clean up stale ImportJobs when a new scan starts
    if (importJobId && isScanJob) {
      const scanPayload = job.data as ScanLibraryRootJobPayload;
      await db.importJob.updateMany({
        where: {
          libraryRootId: scanPayload.libraryRootId,
          status: { in: ["QUEUED", "RUNNING"] },
          id: { not: importJobId },
        },
        data: {
          status: "FAILED",
          error: "Superseded by new scan",
          finishedAt: new Date(),
          bullmqJobId: null,
        },
      });
    }

    const jobHandlers = handlers ?? createJobHandlers(job);

    try {
      const result = await dispatch(jobHandlers, job);

      // Only the scan root job waits for descendants — all children at every
      // level register it as their direct parent via scanJobId/scanQueueName.
      // Uses the BullMQ step pattern: moveToWaitingChildren + throw WaitingChildrenError.
      // When all children complete, BullMQ re-activates the scan root and the
      // completion phase (step === "waiting-children") fires above.
      if (isScanJob) {
        await job.updateData({ ...job.data, step: "waiting-children" });
        const shouldWait = await job.moveToWaitingChildren(token ?? "");
        if (shouldWait) {
          logger.info({ jobId: job.id, jobName: job.name }, "Waiting for child jobs to complete");
          throw new WaitingChildrenError();
        }

        // No children (or all already done) — complete immediately
        if (importJobId) {
          await db.importJob.update({
            where: { id: importJobId, status: "RUNNING" },
            data: { status: "SUCCEEDED", finishedAt: new Date(), scanStage: null, bullmqJobId: null },
          });
          logger.info({ jobId: job.id, importJobId }, "Scan completed immediately (no pending children)");
        }
        activeScanType = null;
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
            scanStage: null,
            bullmqJobId: null,
          },
        });
      }
      if (importJobId && !isScanJob && finalAttempt) {
        await db.importJob.updateMany({
          where: { id: importJobId, status: { in: ["QUEUED", "RUNNING"] } },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            error: `Child job ${job.name} failed: ${error instanceof Error ? error.message : String(error)}`,
            scanStage: null,
            bullmqJobId: null,
          },
        });
      }
      if (isScanJob) activeScanType = null;
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
  matchSuggestions,
};

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
      concurrency: SCAN_CONCURRENCY_DEFAULTS.onDemand,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  );

  const pollInterval = setInterval(() => {
    void pollConcurrency(worker);
  }, CONCURRENCY_POLL_INTERVAL_MS);

  return { connection, pollInterval, worker };
}

function getActiveScanType(): ScanType {
  if (activeScanType !== null) {
    return activeScanType;
  }
  return "onDemand";
}

async function pollConcurrency(worker: Pick<Worker, "concurrency">): Promise<void> {
  try {
    const scanType = getActiveScanType();
    const key = SCAN_CONCURRENCY_KEYS[scanType];
    const defaultValue = SCAN_CONCURRENCY_DEFAULTS[scanType];
    const setting = await db.appSetting.findUnique({ where: { key } });
    const desired = setting ? Number(setting.value) : defaultValue;
    if (!Number.isNaN(desired) && desired >= 1 && desired <= 20 && worker.concurrency !== desired) {
      worker.concurrency = desired;
      logger.info({ concurrency: desired }, "Worker concurrency updated");
    }
  } catch {
    // DB unavailable — keep current concurrency
  }
}

export const SHUTDOWN_TIMEOUT_MS = 10_000;

export async function shutdownLibraryWorker(
  worker: Pick<Worker, "close">,
  connection: Pick<IORedis, "quit">,
  pollInterval?: ReturnType<typeof setInterval>,
): Promise<void> {
  const forceExit = setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  if (pollInterval !== undefined) {
    clearInterval(pollInterval);
  }
  await worker.close();
  await connection.quit();
  clearTimeout(forceExit);
}

export function logEnrichmentWorkerError(err: Error): void {
  logger.error({ err }, "Failed to start enrichment worker");
}

export function handleEnrichmentWorkerModule(m: { startEnrichmentWorker: () => void }): void {
  m.startEnrichmentWorker();
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

  void import("./enrichment-worker").then(handleEnrichmentWorkerModule, logEnrichmentWorkerError);
}

// Coverage: defaultHandlers referenced to ensure the import is exercised
export { defaultHandlers as _defaultHandlers };

// Exported for testing only — allows unit tests to call pollConcurrency directly
// and set the module-level activeScanType without relying on fake timer async races.
export { pollConcurrency as _pollConcurrency, getActiveScanType as _getActiveScanType };
export function _setActiveScanType(scanType: ScanType | null): void {
  activeScanType = scanType;
}


if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrapLibraryWorker();
}
