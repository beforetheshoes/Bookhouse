import { beforeEach, describe, expect, it, vi } from "vitest";

const waitUntilFinishedMock = vi.fn(async () => undefined);
const addMock = vi.fn(async () => ({
  id: "job-1",
  name: "scan-library-root",
  waitUntilFinished: waitUntilFinishedMock,
}));
const closeQueueMock = vi.fn(async () => undefined);
const closeQueueEventsMock = vi.fn(async () => undefined);
const duplicateMock = vi.fn(() => ({ duplicated: true }));
const queueConstructorMock = vi.fn();
const queueEventsConstructorMock = vi.fn();
const quitMock = vi.fn(async () => "OK");
const redisConstructorMock = vi.fn();
const waitUntilReadyMock = vi.fn(async () => undefined);

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(config: unknown) {
      redisConstructorMock(config);
    }

    duplicate = duplicateMock;
    quit = quitMock;
  },
}));

vi.mock("bullmq", () => ({
  Queue: class FakeQueue {
    constructor(...args: unknown[]) {
      queueConstructorMock(...args);
    }

    add = addMock;
    close = closeQueueMock;
  },
  QueueEvents: class FakeQueueEvents {
    constructor(...args: unknown[]) {
      queueEventsConstructorMock(...args);
    }

    close = closeQueueEventsMock;
    waitUntilReady = waitUntilReadyMock;
  },
}));

vi.mock("@bookhouse/shared", async () => {
  const actual = await vi.importActual<typeof import("@bookhouse/shared")>(
    "@bookhouse/shared",
  );

  return {
    ...actual,
    getQueueConnectionConfig: () => ({ host: "localhost", port: 6379 }),
  };
});

beforeEach(() => {
  addMock.mockClear();
  closeQueueEventsMock.mockClear();
  closeQueueMock.mockClear();
  duplicateMock.mockClear();
  queueConstructorMock.mockClear();
  queueEventsConstructorMock.mockClear();
  quitMock.mockClear();
  redisConstructorMock.mockClear();
  waitUntilFinishedMock.mockClear();
  waitUntilReadyMock.mockClear();
});

describe("enqueue test script", () => {
  it("enqueues a real library scan job and waits for completion", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("./enqueue-test");

    expect(redisConstructorMock).toHaveBeenCalledWith({ host: "localhost", port: 6379 });
    expect(queueConstructorMock).toHaveBeenCalledWith("library", { connection: expect.any(Object) });
    expect(queueEventsConstructorMock).toHaveBeenCalledWith("library", {
      connection: { duplicated: true },
    });
    expect(waitUntilReadyMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith("scan-library-root", {
      libraryRootId: "example-library-root-id",
    });
    expect(waitUntilFinishedMock).toHaveBeenCalledTimes(1);
    expect(closeQueueEventsMock).toHaveBeenCalledTimes(1);
    expect(closeQueueMock).toHaveBeenCalledTimes(1);
    expect(quitMock).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith("Enqueued job job-1 [scan-library-root]");
    expect(consoleLogSpy).toHaveBeenCalledWith("Verified job job-1 completed");

    consoleLogSpy.mockRestore();
  });
});
