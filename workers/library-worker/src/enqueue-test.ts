import IORedis from "ioredis";
import { Queue, QueueEvents } from "bullmq";
import { QUEUES, getQueueConnectionConfig } from "@bookhouse/shared";

const connection = new IORedis(getQueueConnectionConfig());
const queue = new Queue(QUEUES.LIBRARY, { connection });
const queueEvents = new QueueEvents(QUEUES.LIBRARY, { connection: connection.duplicate() });

await queueEvents.waitUntilReady();

const job = await queue.add("test-job", {
  message: "Hello from enqueue-test",
  timestamp: new Date().toISOString(),
});

console.log(`Enqueued job ${job.id} [${job.name}]`);

await job.waitUntilFinished(queueEvents);
console.log(`Verified job ${job.id} completed`);

await queueEvents.close();
await queue.close();
await connection.quit();
