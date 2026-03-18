import { EventEmitter } from "node:events";
import { createQueueEvents } from "@bookhouse/shared";

interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
}

class QueueEventsManager {
  private queueEvents: ReturnType<typeof createQueueEvents>;
  private emitter = new EventEmitter();

  constructor() {
    this.queueEvents = createQueueEvents();
    this.setupListeners();
  }

  private setupListeners() {
    this.queueEvents.on("completed", ({ jobId }) => {
      this.broadcast({ type: "job:completed", data: { jobId } });
    });
    this.queueEvents.on("failed", ({ jobId, failedReason }) => {
      this.broadcast({ type: "job:failed", data: { jobId, error: failedReason } });
    });
    this.queueEvents.on("active", ({ jobId }) => {
      this.broadcast({ type: "job:active", data: { jobId } });
    });
    this.queueEvents.on("progress", ({ jobId, data }) => {
      this.broadcast({ type: "job:progress", data: { jobId, progress: data } });
    });
  }

  private broadcast(event: SSEEvent) {
    this.emitter.emit("sse-event", event);
  }

  subscribe(callback: (event: SSEEvent) => void): () => void {
    this.emitter.on("sse-event", callback);
    return () => {
      this.emitter.off("sse-event", callback);
    };
  }

  async close() {
    await this.queueEvents.close();
  }
}

let instance: QueueEventsManager | null = null;

export function getQueueEventsManager(): QueueEventsManager {
  if (!instance) {
    instance = new QueueEventsManager();
  }
  return instance;
}
