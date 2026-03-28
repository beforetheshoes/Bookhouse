import { EventEmitter } from "node:events";
import { createQueueEvents, QUEUES } from "@bookhouse/shared";
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
  private queueEventsList: QueueEventsLike[];
  private emitter = new EventEmitter();

  constructor(queueEvents: QueueEventsLike | QueueEventsLike[]) {
    this.queueEventsList = Array.isArray(queueEvents) ? queueEvents : [queueEvents];
    for (const qe of this.queueEventsList) {
      this.setupListeners(qe);
    }
  }

  private setupListeners(queueEvents: QueueEventsLike) {
    queueEvents.on("completed", ({ jobId }: { jobId: string }) => {
      this.broadcast({ type: "job:completed", data: { jobId } });
    });
    queueEvents.on("failed", ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      this.broadcast({ type: "job:failed", data: { jobId, error: failedReason } });
    });
    queueEvents.on("active", ({ jobId }: { jobId: string }) => {
      this.broadcast({ type: "job:active", data: { jobId } });
    });
    queueEvents.on("progress", ({ jobId, data }: { jobId: string; data: QueueProgressData }) => {
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
    await Promise.all(this.queueEventsList.map((qe) => qe.close()));
  }
}

let instance: QueueEventsManager | null = null;

export function getQueueEventsManager(): QueueEventsManager {
  if (!instance) {
    instance = new QueueEventsManager([
      createQueueEvents(QUEUES.LIBRARY),
      createQueueEvents(QUEUES.ENRICHMENT),
    ]);
  }
  return instance;
}

export function resetQueueEventsManager(): void {
  instance = null;
}
