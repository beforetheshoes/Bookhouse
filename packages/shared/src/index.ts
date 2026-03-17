export const QUEUES = {
  LIBRARY: "library",
} as const;

export function getQueueUrl(): string {
  const url = process.env.QUEUE_URL;
  if (!url) {
    throw new Error("QUEUE_URL environment variable is required");
  }
  return url;
}

export function getQueueConnectionConfig() {
  const queueUrl = new URL(getQueueUrl());

  if (queueUrl.protocol !== "redis:" && queueUrl.protocol !== "rediss:") {
    throw new Error(`Unsupported queue protocol: ${queueUrl.protocol}`);
  }

  return {
    host: queueUrl.hostname,
    port: queueUrl.port ? Number(queueUrl.port) : 6379,
    username: queueUrl.username || undefined,
    password: queueUrl.password || undefined,
    db: queueUrl.pathname.length > 1 ? Number(queueUrl.pathname.slice(1)) : undefined,
    tls: queueUrl.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
