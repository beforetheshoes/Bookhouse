import type * as SharedModule from "@bookhouse/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const closeQueueEventsMock = vi.fn(() => Promise.resolve(undefined));
const duplicateMock = vi.fn(() => ({ duplicated: true }));
const enqueueLibraryJobMock = vi.fn(() => Promise.resolve("job-1"));
const queueEventsConstructorMock = vi.fn();
const quitMock = vi.fn(() => Promise.resolve("OK"));
const redisConstructorMock = vi.fn();
const waitUntilReadyMock = vi.fn(() => Promise.resolve(undefined));

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
  QueueEvents: class FakeQueueEvents {
    constructor(...args: unknown[]) {
      queueEventsConstructorMock(...args);
    }

    close = closeQueueEventsMock;
    waitUntilReady = waitUntilReadyMock;
  },
}));

vi.mock("@bookhouse/shared", async () => {
  const actual = await vi.importActual<typeof SharedModule>(
    "@bookhouse/shared",
  );

  return {
    ...actual,
    enqueueLibraryJob: enqueueLibraryJobMock,
    getQueueConnectionConfig: () => ({ host: "localhost", port: 6379 }),
  };
});

beforeEach(() => {
  closeQueueEventsMock.mockClear();
  duplicateMock.mockClear();
  enqueueLibraryJobMock.mockClear();
  queueEventsConstructorMock.mockClear();
  quitMock.mockClear();
  redisConstructorMock.mockClear();
  waitUntilReadyMock.mockClear();
});

describe("enqueue test script", () => {
  it("enqueues a real library scan job", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("./enqueue-test");

    expect(redisConstructorMock).toHaveBeenCalledWith({ host: "localhost", port: 6379 });
    expect(queueEventsConstructorMock).toHaveBeenCalledWith("library", {
      connection: expect.any(Object),
    });
    expect(waitUntilReadyMock).toHaveBeenCalledTimes(1);
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith("scan-library-root", {
      libraryRootId: "example-library-root-id",
    });
    expect(consoleLogSpy).toHaveBeenCalledWith("Enqueued job job-1 [scan-library-root]");
    expect(closeQueueEventsMock).toHaveBeenCalledTimes(1);
    expect(quitMock).toHaveBeenCalledTimes(1);

    consoleLogSpy.mockRestore();
  });
});
