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
