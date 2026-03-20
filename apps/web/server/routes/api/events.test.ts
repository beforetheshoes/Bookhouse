import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SSEEvent } from "../../utils/queue-events";

let subscribeCallback: ((event: SSEEvent) => void) | null = null;
const mockUnsubscribe = vi.fn();
const mockSubscribe = vi.fn((cb: (event: SSEEvent) => void) => {
  subscribeCallback = cb;
  return mockUnsubscribe;
});

vi.mock("../../utils/queue-events", () => ({
  getQueueEventsManager: () => ({
    subscribe: mockSubscribe,
  }),
}));

let onClosedCallback: (() => void) | null = null;
const mockPush = vi.fn();
const mockSend = vi.fn().mockReturnValue("stream-response");
const mockOnClosed = vi.fn((cb: () => void) => {
  onClosedCallback = cb;
});

vi.mock("h3", () => ({
  defineEventHandler: (fn: unknown) => fn,
  createEventStream: () => ({
    push: mockPush,
    send: mockSend,
    onClosed: mockOnClosed,
  }),
}));

describe("events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    subscribeCallback = null;
    onClosedCallback = null;
  });

  it("creates stream and subscribes to queue events", async () => {
    const mod = await import("./events");
    const handler = mod.default as (event: unknown) => Promise<unknown>;

    const result = await handler({});

    expect(mockSubscribe).toHaveBeenCalled();
    expect(mockOnClosed).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalled();
    expect(result).toBe("stream-response");
  });

  it("pushes SSE events to stream", async () => {
    const mod = await import("./events");
    const handler = mod.default as (event: unknown) => Promise<unknown>;

    await handler({});

    subscribeCallback!({
      type: "job:completed",
      data: { jobId: "j1" },
    });

    expect(mockPush).toHaveBeenCalledWith({
      event: "job:completed",
      data: JSON.stringify({ jobId: "j1" }),
    });
  });

  it("sends heartbeat every 30 seconds", async () => {
    const mod = await import("./events");
    const handler = mod.default as (event: unknown) => Promise<unknown>;

    await handler({});

    vi.advanceTimersByTime(30_000);

    expect(mockPush).toHaveBeenCalledWith({
      event: "heartbeat",
      data: "{}",
    });
  });

  it("cleans up on close", async () => {
    const mod = await import("./events");
    const handler = mod.default as (event: unknown) => Promise<unknown>;

    await handler({});

    onClosedCallback!();

    expect(mockUnsubscribe).toHaveBeenCalled();

    // Heartbeat should no longer fire
    mockPush.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
