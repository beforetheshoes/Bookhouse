import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueueEventsManager, getQueueEventsManager, resetQueueEventsManager } from "./queue-events";

function createMockQueueEvents() {
  const emitter = new EventEmitter();
  return {
    on: (event: string, callback: (...args: never[]) => void) => {
      emitter.on(event, callback as (...args: Array<string | object>) => void);
    },
    emit: (event: string, ...args: Array<string | object>) => emitter.emit(event, ...args),
    close: vi.fn(),
  };
}

vi.mock("@bookhouse/shared", () => ({
  createQueueEvents: vi.fn(() => createMockQueueEvents()),
}));

describe("QueueEventsManager", () => {
  it("forwards completed events as job:completed", () => {
    const qe = createMockQueueEvents();
    const manager = new QueueEventsManager(qe);
    const callback = vi.fn();
    manager.subscribe(callback);

    qe.emit("completed", { jobId: "j1" });

    expect(callback).toHaveBeenCalledWith({
      type: "job:completed",
      data: { jobId: "j1" },
    });
  });

  it("forwards failed events as job:failed", () => {
    const qe = createMockQueueEvents();
    const manager = new QueueEventsManager(qe);
    const callback = vi.fn();
    manager.subscribe(callback);

    qe.emit("failed", { jobId: "j2", failedReason: "timeout" });

    expect(callback).toHaveBeenCalledWith({
      type: "job:failed",
      data: { jobId: "j2", error: "timeout" },
    });
  });

  it("forwards active events as job:active", () => {
    const qe = createMockQueueEvents();
    const manager = new QueueEventsManager(qe);
    const callback = vi.fn();
    manager.subscribe(callback);

    qe.emit("active", { jobId: "j3" });

    expect(callback).toHaveBeenCalledWith({
      type: "job:active",
      data: { jobId: "j3" },
    });
  });

  it("forwards progress events as job:progress", () => {
    const qe = createMockQueueEvents();
    const manager = new QueueEventsManager(qe);
    const callback = vi.fn();
    manager.subscribe(callback);

    qe.emit("progress", { jobId: "j4", data: { percent: 50 } });

    expect(callback).toHaveBeenCalledWith({
      type: "job:progress",
      data: { jobId: "j4", progress: { percent: 50 } },
    });
  });

  it("unsubscribe stops receiving events", () => {
    const qe = createMockQueueEvents();
    const manager = new QueueEventsManager(qe);
    const callback = vi.fn();
    const unsubscribe = manager.subscribe(callback);

    qe.emit("completed", { jobId: "j1" });
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    qe.emit("completed", { jobId: "j2" });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("close delegates to underlying queue events", async () => {
    const qe = createMockQueueEvents();
    const manager = new QueueEventsManager(qe);

    await manager.close();

    expect(qe.close).toHaveBeenCalled();
  });
});

describe("getQueueEventsManager", () => {
  beforeEach(() => {
    resetQueueEventsManager();
  });

  it("returns a singleton instance", () => {
    const a = getQueueEventsManager();
    const b = getQueueEventsManager();
    expect(a).toBe(b);
  });

  it("returns a new instance after reset", () => {
    const a = getQueueEventsManager();
    resetQueueEventsManager();
    const b = getQueueEventsManager();
    expect(a).not.toBe(b);
  });
});
