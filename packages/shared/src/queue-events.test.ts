import { beforeEach, describe, expect, it, vi } from "vitest";

const queueEventsConstructorMock = vi.fn();
const queueConnectionConfigMock = vi.fn(() => ({ host: "localhost", port: 6379 }));

vi.mock("bullmq", () => ({
  QueueEvents: class FakeQueueEvents {
    constructor(...args: unknown[]) {
      queueEventsConstructorMock(...args);
    }
  },
}));

vi.mock("./queues.js", async () => {
  const actual = await vi.importActual<typeof import("./queues.js")>("./queues.js");
  return {
    ...actual,
    getQueueConnectionConfig: queueConnectionConfigMock,
  };
});

beforeEach(() => {
  vi.resetModules();
  queueEventsConstructorMock.mockClear();
  queueConnectionConfigMock.mockClear();
  process.env.QUEUE_URL = "redis://localhost:6379";
});

describe("createQueueEvents", () => {
  it("creates a QueueEvents instance for the library queue by default", async () => {
    const { createQueueEvents, QUEUES } = await import("./index");
    createQueueEvents();

    expect(queueConnectionConfigMock).toHaveBeenCalledTimes(1);
    expect(queueEventsConstructorMock).toHaveBeenCalledWith(QUEUES.LIBRARY, {
      connection: { host: "localhost", port: 6379 },
    });
  });

  it("creates a QueueEvents instance for a custom queue name", async () => {
    const { createQueueEvents } = await import("./index");
    createQueueEvents("custom-queue");

    expect(queueEventsConstructorMock).toHaveBeenCalledWith("custom-queue", {
      connection: { host: "localhost", port: 6379 },
    });
  });
});
