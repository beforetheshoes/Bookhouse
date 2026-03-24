import IORedis from "ioredis";
import { Queue } from "bullmq";
import { QUEUES, getQueueConnectionConfig } from "./queues.js";
import type { LibraryJobName, LibraryJobPayload } from "./queues.js";
import { JOB_PRIORITY, RETRY_CONFIG } from "./queues.js";
import { QueueError } from "./errors.js";
import { createLogger } from "./logger.js";

const logger = createLogger("queue-client");

let queueSingleton:
  | {
      connection: IORedis;
      queue: Queue;
    }
  | undefined;

function getQueue(): Queue {
  if (queueSingleton === undefined) {
    const connection = new IORedis(getQueueConnectionConfig());
    const queue = new Queue(QUEUES.LIBRARY, { connection });
    queueSingleton = { connection, queue };
  }
  return queueSingleton.queue;
}

export interface EnqueueJobOpts {
  parent?: { id: string; queue: string };
  removeDependencyOnFailure?: boolean;
}

export async function obliterateLibraryQueue(): Promise<void> {
  // Use flushdb instead of queue.obliterate() — obliterate can't keep up
  // when the worker is processing jobs faster than they can be removed
  const connection = getQueueConnection();
  await connection.flushdb();
  logger.info("Library queue obliterated via FLUSHDB");
}

export async function getLibraryJobState(jobId: string): Promise<string | null> {
  const snapshot = await getLibraryJobSnapshot(jobId);
  return snapshot?.state ?? null;
}

export interface LibraryJobSnapshot {
  blockedByFailedChild: boolean;
  lastActivityAt: number | null;
  progress: unknown;
  state: string;
}

export interface ImportJobLiveActivity {
  lastActivityAt: number | null;
  scanStage: "PROCESSING";
}

function getJobIdFromDependencyKey(dependencyKey: string): string {
  return dependencyKey.slice(dependencyKey.lastIndexOf(":") + 1);
}

function getJobActivityTimestamp(job: {
  finishedOn?: number;
  processedOn?: number;
  timestamp?: number;
}): number | null {
  const lastActivityAt = Math.max(job.finishedOn ?? 0, job.processedOn ?? 0, job.timestamp ?? 0);
  return lastActivityAt > 0 ? lastActivityAt : null;
}

async function getDescendantStatus(jobId: string): Promise<{
  blockedByFailedChild: boolean;
  lastActivityAt: number | null;
}> {
  const queue = getQueue();
  const pendingJobIds = [jobId];
  const visitedJobIds = new Set<string>();
  let lastActivityAt: number | null = null;

  while (pendingJobIds.length > 0) {
    const currentJobId = pendingJobIds.pop() ?? "";
    if (currentJobId === "" || visitedJobIds.has(currentJobId)) {
      continue;
    }
    visitedJobIds.add(currentJobId);

    const currentJob = await queue.getJob(currentJobId);
    if (currentJob == null) {
      return {
        blockedByFailedChild: true,
        lastActivityAt,
      };
    }
    lastActivityAt = Math.max(
      lastActivityAt ?? 0,
      getJobActivityTimestamp(currentJob) ?? 0,
    ) || null;

    const currentState = await currentJob.getState();
    if (currentState === "failed") {
      return {
        blockedByFailedChild: true,
        lastActivityAt,
      };
    }

    if (currentState !== "waiting-children") {
      continue;
    }

    const dependencies = await currentJob.getDependencies({
      failed: { count: 1 },
      unprocessed: { count: 100 },
    });
    if ((dependencies.failed ?? []).length > 0) {
      return {
        blockedByFailedChild: true,
        lastActivityAt,
      };
    }

    for (const dependencyKey of dependencies.unprocessed ?? []) {
      pendingJobIds.push(getJobIdFromDependencyKey(dependencyKey));
    }
  }

  return {
    blockedByFailedChild: false,
    lastActivityAt,
  };
}

export async function getLibraryJobSnapshot(
  jobId: string,
): Promise<LibraryJobSnapshot | null> {
  const job = await getQueue().getJob(jobId);
  if (job == null) {
    return null;
  }
  const state = await job.getState();
  const descendantStatus = state === "waiting-children"
    ? await getDescendantStatus(jobId)
    : {
      blockedByFailedChild: false,
      lastActivityAt: getJobActivityTimestamp(job),
    };

  return {
    blockedByFailedChild: descendantStatus.blockedByFailedChild,
    lastActivityAt: descendantStatus.lastActivityAt,
    progress: job.progress,
    state,
  };
}

const LIVE_IMPORT_JOB_SCAN_STATES = ["active", "prioritized", "waiting", "waiting-children"] as const;
const LIVE_IMPORT_JOB_BATCH_SIZE = 500;

export async function getImportJobLiveActivity(
  importJobId: string,
): Promise<ImportJobLiveActivity | null> {
  const queue = getQueue();

  for (const state of LIVE_IMPORT_JOB_SCAN_STATES) {
    let start = 0;

    for (;;) {
      const jobs = await queue.getJobs([state], start, start + LIVE_IMPORT_JOB_BATCH_SIZE - 1, true);
      if (jobs.length === 0) {
        break;
      }

      for (const job of jobs) {
        if ((job.data as { importJobId?: string }).importJobId !== importJobId) {
          continue;
        }

        return {
          lastActivityAt: getJobActivityTimestamp(job),
          scanStage: "PROCESSING",
        };
      }

      if (jobs.length < LIVE_IMPORT_JOB_BATCH_SIZE) {
        break;
      }

      start += LIVE_IMPORT_JOB_BATCH_SIZE;
    }
  }

  return null;
}

function getQueueConnection(): IORedis {
  if (queueSingleton === undefined) {
    getQueue();
  }
  return (queueSingleton as NonNullable<typeof queueSingleton>).connection;
}

export async function enqueueLibraryJob<TName extends LibraryJobName>(
  jobName: TName,
  payload: LibraryJobPayload<TName>,
  opts?: EnqueueJobOpts,
): Promise<string> {
  try {
    const queue = getQueue();
    const retryConfig = RETRY_CONFIG[jobName];
    const job = await queue.add(jobName, payload, {
      attempts: retryConfig.attempts,
      backoff: retryConfig.backoff,
      priority: JOB_PRIORITY[jobName],
      ...opts,
    });
    const jobId = job.id ?? "unknown";
    logger.info({ jobName, jobId }, "Job enqueued");
    return jobId;
  } catch (error) {
    throw new QueueError(`Failed to enqueue job: ${jobName}`, {
      cause: error,
      context: { jobName, payload: payload as unknown as Record<string, unknown> },
    });
  }
}
