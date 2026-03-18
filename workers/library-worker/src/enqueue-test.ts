import IORedis from "ioredis";
import { QueueEvents } from "bullmq";
import {
  LIBRARY_JOB_NAMES,
  QUEUES,
  enqueueLibraryJob,
  getQueueConnectionConfig,
} from "@bookhouse/shared";

const connection = new IORedis(getQueueConnectionConfig());
const queueEvents = new QueueEvents(QUEUES.LIBRARY, { connection });

await queueEvents.waitUntilReady();

const jobId = await enqueueLibraryJob(LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT, {
  libraryRootId: "example-library-root-id",
});

console.log(`Enqueued job ${jobId} [${LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT}]`);

await queueEvents.close();
await connection.quit();
