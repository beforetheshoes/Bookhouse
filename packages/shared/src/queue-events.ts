import { QueueEvents } from "bullmq";
import { getQueueConnectionConfig, QUEUES } from "./queues.js";

export function createQueueEvents(queueName: string = QUEUES.LIBRARY): QueueEvents {
  return new QueueEvents(queueName, { connection: getQueueConnectionConfig() });
}
