import IORedis from "ioredis";
import { Queue, QueueEvents } from "bullmq";
import {
  LIBRARY_JOB_NAMES,
  QUEUES,
  getQueueConnectionConfig,
} from "@bookhouse/shared";

const connection = new IORedis(getQueueConnectionConfig());
const queue = new Queue(QUEUES.LIBRARY, { connection });
const queueEvents = new QueueEvents(QUEUES.LIBRARY, { connection: connection.duplicate() });

await queueEvents.waitUntilReady();

const job = await queue.add(LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT, {
  libraryRootId: "example-library-root-id",
});

console.log(`Enqueued job ${job.id} [${job.name}]`);

await job.waitUntilFinished(queueEvents);
console.log(`Verified job ${job.id} completed`);

await queueEvents.close();
await queue.close();
await connection.quit();
