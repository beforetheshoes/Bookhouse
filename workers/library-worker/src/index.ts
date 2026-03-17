import IORedis from "ioredis";
import { Worker, Job } from "bullmq";
import { QUEUES, getQueueConnectionConfig } from "@bookhouse/shared";

const connection = new IORedis(getQueueConnectionConfig());

const worker = new Worker(
  QUEUES.LIBRARY,
  async (job: Job) => {
    console.log(`Processing job ${job.id} [${job.name}]`, job.data);
  },
  { connection },
);

worker.on("ready", () => console.log("Worker ready, waiting for jobs..."));
worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
worker.on("failed", (job, err) =>
  console.error(`Job ${job?.id} failed:`, err.message),
);

async function shutdown() {
  console.log("Shutting down worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`library-worker listening on queue "${QUEUES.LIBRARY}"`);
