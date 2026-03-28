import IORedis from "ioredis";
import { type Job, Worker } from "bullmq";
import { db } from "@bookhouse/db";
import {
  enrichContributor,
  searchOpenLibraryAuthors,
  searchHardcoverAuthors,
  searchWikidataAuthors,
  applyAuthorPhotoFromUrl,
  resizeAndSaveCover,
  createOLFetcher,
  TokenBucketLimiter,
  type EnrichContributorDeps,
  type EnrichContributorResult,
} from "@bookhouse/ingest";
import {
  ENRICHMENT_JOB_NAMES,
  type BaseJobPayload,
  type EnrichmentJobName,
  type EnrichmentJobPayload,
  QUEUES,
  createLogger,
  getQueueConnectionConfig,
} from "@bookhouse/shared";
import { fileURLToPath } from "node:url";

const logger = createLogger("enrichment-worker");

const olLimiter = new TokenBucketLimiter(3);
const hcLimiter = new TokenBucketLimiter(1);
const wdLimiter = new TokenBucketLimiter(1);
const olFetch = createOLFetcher("bookhouse@teamsnail.org");

function getCoverCacheDir(): string {
  if (process.env.COVER_CACHE_DIR) return process.env.COVER_CACHE_DIR;
  if (process.env.NODE_ENV === "production") return "/data/covers";
  return fileURLToPath(new URL("../../covers", import.meta.url));
}

async function decryptValue(ciphertext: string, secret: string): Promise<string> {
  const { createHash, createDecipheriv } = await import("node:crypto");
  const key = createHash("sha256").update(secret).digest();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
}

async function getHardcoverApiKey(): Promise<string | null> {
  try {
    const setting = await db.appSetting.findUnique({ where: { key: "apiKey:hardcover" } });
    if (!setting) return null;
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      logger.warn("AUTH_SECRET not set — cannot decrypt Hardcover API key");
      return null;
    }
    return await decryptValue(setting.value, secret);
  } catch (err) {
    logger.warn({ err }, "Failed to decrypt Hardcover API key");
    return null;
  }
}

function applyPhoto(contributorId: string, imageUrl: string) {
  return applyAuthorPhotoFromUrl(
    { contributorId, imageUrl, coverCacheDir: getCoverCacheDir() },
    {
      fetchUrl: async (url) => {
        const response = await fetch(url);
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get("content-type");
        return { buffer, contentType };
      },
      resizeAndSave: (buf, dir) => resizeAndSaveCover(buf, dir),
    },
    {
      findContributor: (id) => db.contributor.findUnique({ where: { id }, select: { id: true } }),
      updateContributor: async (id, data) => { await db.contributor.update({ where: { id }, data }); },
    },
  );
}

export interface EnrichmentWorkerHandlers {
  enrichContributor: typeof enrichContributor;
}

async function dispatch(
  job: Job<EnrichmentJobPayload<EnrichmentJobName>, EnrichContributorResult, EnrichmentJobName>,
  handlers: EnrichmentWorkerHandlers,
): Promise<EnrichContributorResult> {
  switch (job.name as string) {
    case ENRICHMENT_JOB_NAMES.ENRICH_CONTRIBUTOR: {
      const payload = job.data;
      const hcKey = await getHardcoverApiKey();
      const deps: EnrichContributorDeps = {
        findContributor: (id) =>
          db.contributor.findUnique({ where: { id }, select: { id: true, nameDisplay: true, imagePath: true } }),
        acquireOLToken: () => olLimiter.acquire(),
        searchOLAuthors: (name) => searchOpenLibraryAuthors(name, olFetch),
        applyPhoto,
        ...(hcKey ? {
          acquireHCToken: () => hcLimiter.acquire(),
          searchHCAuthors: (name: string) => searchHardcoverAuthors(name, hcKey, fetch),
        } : {}),
        acquireWDToken: () => wdLimiter.acquire(),
        searchWDAuthors: (name: string) => searchWikidataAuthors(name, fetch),
      };
      return handlers.enrichContributor(payload.contributorId, deps);
    }
    default:
      throw new Error(`Unsupported enrichment job: ${job.name}`);
  }
}

const defaultHandlers: EnrichmentWorkerHandlers = {
  enrichContributor,
};

async function checkBatchCompletion(importJobId: string): Promise<void> {
  const job = await db.importJob.findUnique({
    where: { id: importJobId },
    select: { totalFiles: true, processedFiles: true },
  });
  if (job && job.totalFiles !== null && job.processedFiles !== null && job.processedFiles >= job.totalFiles) {
    await db.importJob.update({
      where: { id: importJobId },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });
    logger.info({ importJobId }, "Author photo enrichment batch completed");
  }
}

export function createEnrichmentWorkerProcessor(
  handlers: EnrichmentWorkerHandlers = defaultHandlers,
) {
  return async (
    job: Job<EnrichmentJobPayload<EnrichmentJobName>, EnrichContributorResult, EnrichmentJobName>,
  ) => {
    const importJobId = (job.data as BaseJobPayload).importJobId;
    logger.info({ jobId: job.id, jobName: job.name }, "Processing enrichment job");
    try {
      const result = await dispatch(job, handlers);
      const extra = "triedSources" in result ? { triedSources: result.triedSources } : {};
      logger.info({ jobId: job.id, jobName: job.name, status: result.status, ...extra }, "Enrichment job completed");
      if (importJobId) {
        const isError = result.status === "no-results" || result.status === "no-photo";
        await db.importJob.update({
          where: { id: importJobId },
          data: {
            status: "RUNNING",
            startedAt: new Date(),
            processedFiles: { increment: 1 },
            ...(isError ? { errorCount: { increment: 1 } } : {}),
          },
        });
        await checkBatchCompletion(importJobId);
      }
      return result;
    } catch (error) {
      logger.error({ jobId: job.id, jobName: job.name, err: error }, "Enrichment job failed");
      if (importJobId) {
        await db.importJob.update({
          where: { id: importJobId },
          data: {
            status: "RUNNING",
            processedFiles: { increment: 1 },
            errorCount: { increment: 1 },
          },
        }).catch(() => { /* ImportJob update is best-effort */ });
      }
      throw error;
    }
  };
}

export function startEnrichmentWorker() {
  const connection = new IORedis(getQueueConnectionConfig());

  const worker = new Worker(
    QUEUES.ENRICHMENT,
    createEnrichmentWorkerProcessor(),
    {
      connection,
      concurrency: 1,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  );

  logger.info({ queue: QUEUES.ENRICHMENT, concurrency: 1 }, "enrichment-worker listening");

  return { worker, connection };
}
