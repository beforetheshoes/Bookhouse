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
  processBulkEnrichWork,
  searchAllSources,
  searchOpenLibrary,
  getOpenLibraryWork,
  getOpenLibraryEdition,
  searchGoogleBooks,
  searchHardcover,
  searchAudible,
  applyEnrichmentFields,
  canonicalizeContributorName,
  applyCoverFromUrl,
  extractDominantColorsDefault,
  RateLimiter,
  type EnrichContributorDeps,
  type EnrichContributorResult,
  type BulkEnrichDeps,
  type BulkEnrichResult,
  type ApplyEnrichmentDeps,
} from "@bookhouse/ingest";
import {
  ENRICHMENT_JOB_NAMES,
  type BaseJobPayload,
  type BulkEnrichMetadataJobPayload,
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
  processBulkEnrichWork: typeof processBulkEnrichWork;
}

type EnrichmentJobResult = EnrichContributorResult | BulkEnrichResult;

/* c8 ignore start — runtime wiring, mirrors getHardcoverApiKey */
async function getGoogleBooksApiKey(): Promise<string | null> {
  try {
    const setting = await db.appSetting.findUnique({ where: { key: "apiKey:googlebooks" } });
    if (!setting) return null;
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      logger.warn("AUTH_SECRET not set — cannot decrypt Google Books API key");
      return null;
    }
    return await decryptValue(setting.value, secret);
  } catch (err) {
    logger.warn({ err }, "Failed to decrypt Google Books API key");
    return null;
  }
}
/* c8 ignore stop */

/* c8 ignore start — runtime wiring, tested via unit tests on processBulkEnrichWork and applyEnrichmentFields */
function buildBulkEnrichDeps(
  hcKey: string | null,
  gbKey: string | null,
): BulkEnrichDeps {
  const rateLimiter = new RateLimiter();

  return {
    loadWork: async (workId) => {
      const work = await db.work.findUnique({
        where: { id: workId },
        include: {
          editions: {
            include: { contributors: { include: { contributor: true } } },
          },
          tags: { include: { tag: true } },
        },
      });
      if (!work) return null;
      return {
        id: work.id,
        titleDisplay: work.titleDisplay,
        description: work.description,
        coverPath: work.coverPath,
        editedFields: work.editedFields,
        tags: work.tags.map((wt: { tag: { name: string } }) => wt.tag.name),
        editions: work.editions.map((edition: {
          id: string;
          formatFamily: string;
          publisher: string | null;
          publishedAt: Date | null;
          isbn13: string | null;
          isbn10: string | null;
          asin: string | null;
          language: string | null;
          pageCount: number | null;
          duration: number | null;
          editedFields: string[];
          contributors: Array<{ role: string; contributor: { nameDisplay: string } }>;
        }) => ({
          id: edition.id,
          formatFamily: edition.formatFamily as "EBOOK" | "AUDIOBOOK",
          publisher: edition.publisher,
          publishedDate: edition.publishedAt ? (edition.publishedAt.toISOString().split("T")[0] ?? null) : null,
          isbn13: edition.isbn13,
          isbn10: edition.isbn10,
          asin: edition.asin,
          language: edition.language,
          pageCount: edition.pageCount,
          duration: edition.duration,
          editedFields: edition.editedFields,
          narrators: edition.contributors
            .filter((ec) => ec.role === "NARRATOR")
            .map((ec) => ec.contributor.nameDisplay),
          authors: edition.contributors
            .filter((ec) => ec.role === "AUTHOR")
            .map((ec) => ec.contributor.nameDisplay),
        })),
      };
    },
    searchAllSources: (title, author) => {
      const searchDeps = {
        searchOL: (t: string, a: string | undefined) => searchOpenLibrary(t, a, olFetch),
        getOLWork: (olid: string) => getOpenLibraryWork(olid, olFetch),
        getOLEdition: (isbn: string) => getOpenLibraryEdition(isbn, olFetch),
        searchGB: gbKey
          ? (t: string, a: string | undefined) => searchGoogleBooks(t, a, gbKey, fetch)
          : () => Promise.resolve(null),
        searchHC: hcKey
          ? (t: string, a: string | undefined) => searchHardcover(t, a, hcKey, fetch)
          : () => Promise.resolve(null),
        searchAudible: (t: string, a: string | undefined) => searchAudible(t, a, fetch),
        checkRateLimit: () => rateLimiter.check(),
      };
      return searchAllSources(title, author, searchDeps);
    },
    applyEnrichmentFields: (input) => {
      const applyDeps: ApplyEnrichmentDeps = {
        findWork: (id) => db.work.findUnique({ where: { id }, select: { editedFields: true } }),
        updateWork: async (id, data) => { await db.work.update({ where: { id }, data }); },
        findEdition: (id) => db.edition.findUnique({ where: { id }, select: { editedFields: true } }),
        updateEdition: async (id, data) => { await db.edition.update({ where: { id }, data }); },
        findTagByCanonical: async (canonical) => {
          const tag = await db.tag.findFirst({ where: { nameCanonical: canonical } });
          return tag?.id ?? null;
        },
        createTag: async (name, canonical) => {
          const tag = await db.tag.create({ data: { name, nameCanonical: canonical } });
          return tag.id;
        },
        upsertWorkTag: async (workId, tagId) => {
          await db.workTag.upsert({
            where: { workId_tagId: { workId, tagId } },
            create: { workId, tagId },
            update: {},
          });
        },
        findContributorByCanonical: async (canonical) => {
          const c = await db.contributor.findFirst({ where: { nameCanonical: canonical } });
          return c?.id ?? null;
        },
        createContributor: async (name, canonical) => {
          const c = await db.contributor.create({ data: { nameDisplay: name, nameCanonical: canonical } });
          return c.id;
        },
        findEditionIdsByWorkId: async (workId) => {
          const editions = await db.edition.findMany({ where: { workId }, select: { id: true } });
          return editions.map((e: { id: string }) => e.id);
        },
        deleteAuthorContributors: async (editionIds) => {
          await db.editionContributor.deleteMany({ where: { editionId: { in: editionIds }, role: "AUTHOR" } });
        },
        createEditionContributors: async (editionIds, contributorIds) => {
          const data = editionIds.flatMap((editionId: string) =>
            contributorIds.map((contributorId) => ({
              editionId,
              contributorId,
              role: "AUTHOR" as const,
            })),
          );
          await db.editionContributor.createMany({ data, skipDuplicates: true });
        },
        deleteNarratorContributors: async (editionId) => {
          await db.editionContributor.deleteMany({ where: { editionId, role: "NARRATOR" } });
        },
        createNarratorContributors: async (editionId, contributorIds) => {
          const data = contributorIds.map((contributorId) => ({
            editionId,
            contributorId,
            role: "NARRATOR" as const,
          }));
          await db.editionContributor.createMany({ data, skipDuplicates: true });
        },
        upsertExternalLink: async (linkData) => {
          await db.externalLink.upsert({
            where: {
              workId_provider_externalId: {
                workId: linkData.workId,
                provider: linkData.provider,
                externalId: linkData.externalId,
              },
            },
            create: {
              workId: linkData.workId,
              provider: linkData.provider,
              externalId: linkData.externalId,
              appliedAt: new Date(),
              appliedFields: linkData.appliedFields,
            },
            update: {
              appliedAt: new Date(),
              appliedFields: linkData.appliedFields,
            },
          });
        },
        canonicalizeContributorName,
      };
      return applyEnrichmentFields(input, applyDeps);
    },
    applyCoverFromUrl: async (workId, imageUrl, source) => {
      const coverCacheDir = getCoverCacheDir();
      const result = await applyCoverFromUrl(
        { workId, imageUrl, coverCacheDir },
        {
          fetchUrl: async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch image: ${String(res.status)}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            const contentType = res.headers.get("content-type");
            return { buffer, contentType };
          },
          resizeAndSave: (buf, dir) => resizeAndSaveCover(buf, dir),
          extractColors: (buf) => extractDominantColorsDefault(buf),
        },
        {
          findWork: (id) => db.work.findUnique({ where: { id }, select: { editedFields: true } }),
          updateWork: async (id, data) => { await db.work.update({ where: { id }, data }); },
        },
      );
      // Create provenance
      await db.externalLink.upsert({
        where: {
          workId_provider_externalId: {
            workId,
            provider: source.provider,
            externalId: source.externalId,
          },
        },
        create: {
          workId,
          provider: source.provider,
          externalId: source.externalId,
          appliedAt: new Date(),
          appliedFields: ["coverPath"],
        },
        update: {
          appliedAt: new Date(),
          appliedFields: ["coverPath"],
        },
      });
      void result;
    },
  };
}
/* c8 ignore stop */

async function dispatch(
  job: Job<EnrichmentJobPayload<EnrichmentJobName>, EnrichmentJobResult, EnrichmentJobName>,
  handlers: EnrichmentWorkerHandlers,
): Promise<EnrichmentJobResult> {
  switch (job.name as string) {
    case ENRICHMENT_JOB_NAMES.ENRICH_CONTRIBUTOR: {
      const payload = job.data as EnrichmentJobPayload<typeof ENRICHMENT_JOB_NAMES.ENRICH_CONTRIBUTOR>;
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
    case ENRICHMENT_JOB_NAMES.BULK_ENRICH_METADATA: {
      const payload = job.data as BulkEnrichMetadataJobPayload;
      const [hcKey, gbKey] = await Promise.all([getHardcoverApiKey(), getGoogleBooksApiKey()]);
      const bulkDeps = buildBulkEnrichDeps(hcKey, gbKey);
      return handlers.processBulkEnrichWork(payload.workId, payload.sources, payload.strategy, bulkDeps);
    }
    default:
      throw new Error(`Unsupported enrichment job: ${job.name}`);
  }
}

const defaultHandlers: EnrichmentWorkerHandlers = {
  enrichContributor,
  processBulkEnrichWork,
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

const ENRICHMENT_ERROR_STATUSES = new Set(["no-results", "no-photo", "not-found", "no-editions"]);

export function createEnrichmentWorkerProcessor(
  handlers: EnrichmentWorkerHandlers = defaultHandlers,
) {
  return async (
    job: Job<EnrichmentJobPayload<EnrichmentJobName>, EnrichmentJobResult, EnrichmentJobName>,
  ) => {
    const importJobId = (job.data as BaseJobPayload).importJobId;
    logger.info({ jobId: job.id, jobName: job.name }, "Processing enrichment job");
    try {
      const result = await dispatch(job, handlers);
      const extra = "triedSources" in result ? { triedSources: result.triedSources } : {};
      logger.info({ jobId: job.id, jobName: job.name, status: result.status, ...extra }, "Enrichment job completed");
      if (importJobId) {
        const isError = ENRICHMENT_ERROR_STATUSES.has(result.status);
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
