import { EventEmitter } from "node:events";
import { createQueueEvents } from "@bookhouse/shared";
import type { QueueProgressData } from "@bookhouse/shared";

export type SSEJobEventData =
  | { jobId: string }
  | { jobId: string; error: string }
  | { jobId: string; progress: QueueProgressData };

export interface SSEEvent {
  type: string;
  data: SSEJobEventData;
}

interface QueueEventsLike {
  on(event: string, callback: (...args: never[]) => void): void;
  close(): Promise<void>;
}

export class QueueEventsManager {
  private queueEvents: QueueEventsLike;
  private emitter = new EventEmitter();

  constructor(queueEvents: QueueEventsLike) {
    this.queueEvents = queueEvents;
    this.setupListeners();
  }

  private setupListeners() {
    this.queueEvents.on("completed", ({ jobId }: { jobId: string }) => {
      this.broadcast({ type: "job:completed", data: { jobId } });
    });
    this.queueEvents.on("failed", ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      this.broadcast({ type: "job:failed", data: { jobId, error: failedReason } });
    });
    this.queueEvents.on("active", ({ jobId }: { jobId: string }) => {
      this.broadcast({ type: "job:active", data: { jobId } });
    });
    this.queueEvents.on("progress", ({ jobId, data }: { jobId: string; data: QueueProgressData }) => {
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
    instance = new QueueEventsManager(createQueueEvents());
  }
  return instance;
}

export function resetQueueEventsManager(): void {
  instance = null;
}
