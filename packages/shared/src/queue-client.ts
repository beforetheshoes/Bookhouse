import IORedis from "ioredis";
import { Queue } from "bullmq";
import { QUEUES, getQueueConnectionConfig } from "./queues.js";
import type { LibraryJobName, LibraryJobPayload } from "./queues.js";
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

export async function enqueueLibraryJob<TName extends LibraryJobName>(
  jobName: TName,
  payload: LibraryJobPayload<TName>,
): Promise<string> {
  try {
    const queue = getQueue();
    const job = await queue.add(jobName, payload);
    logger.info({ jobName, jobId: job.id }, "Job enqueued");
    return job.id!;
  } catch (error) {
    throw new QueueError(`Failed to enqueue job: ${jobName}`, {
      cause: error,
      context: { jobName, payload: payload as unknown as Record<string, unknown> },
    });
  }
}
