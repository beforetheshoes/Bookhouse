// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSSE } from "./use-sse";

const addEventListenerMock = vi.fn();
const closeMock = vi.fn();
const eventSourceListeners: Map<string, (...args: Array<string | Event | object>) => void> = new Map();

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  onerror: ((...args: Array<string | Event | object>) => void) | null = null;
  constructor(public url: string) {}
  addEventListener = vi.fn((type: string, handler: (...args: Array<string | Event | object>) => void) => {
    eventSourceListeners.set(type, handler);
    addEventListenerMock(type, handler);
  });
  close = closeMock;
}

vi.stubGlobal("EventSource", FakeEventSource);

const invalidateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: invalidateMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Clear tracked listeners
  eventSourceListeners.clear();
});

it("creates EventSource and registers 4 event listeners when enabled=true", () => {
  renderHook(() => { useSSE({ enabled: true }); });

  expect(addEventListenerMock).toHaveBeenCalledTimes(4);
  expect(addEventListenerMock).toHaveBeenCalledWith("job:completed", expect.any(Function));
  expect(addEventListenerMock).toHaveBeenCalledWith("job:failed", expect.any(Function));
  expect(addEventListenerMock).toHaveBeenCalledWith("job:active", expect.any(Function));
  expect(addEventListenerMock).toHaveBeenCalledWith("job:progress", expect.any(Function));
});

it("sets onerror on the EventSource", () => {
  const instances: FakeEventSource[] = [];
  const OriginalFake = FakeEventSource;
  vi.stubGlobal("EventSource", class extends OriginalFake {
    constructor(url: string) {
      super(url);
      instances.push(this as FakeEventSource);
    }
  });

  renderHook(() => { useSSE({ enabled: true }); });
  expect(instances.length).toBeGreaterThan(0);
  const lastInstance = instances[instances.length - 1];
  expect(lastInstance?.onerror).toBeTypeOf("function");

  // Restore original stub
  vi.stubGlobal("EventSource", FakeEventSource);
});

it("calling an event handler calls router.invalidate()", () => {
  renderHook(() => { useSSE({ enabled: true }); });

  eventSourceListeners.get("job:completed")?.({});
  expect(invalidateMock).toHaveBeenCalledTimes(1);
});

it("throttles rapid invalidations to at most once per 2 seconds", () => {
  vi.useFakeTimers();
  renderHook(() => { useSSE({ enabled: true }); });

  // First event fires immediately
  eventSourceListeners.get("job:completed")?.({});
  expect(invalidateMock).toHaveBeenCalledTimes(1);

  // Rapid subsequent events within the throttle window are suppressed
  eventSourceListeners.get("job:progress")?.({});
  eventSourceListeners.get("job:active")?.({});
  eventSourceListeners.get("job:completed")?.({});
  expect(invalidateMock).toHaveBeenCalledTimes(1);

  // After the throttle window, a trailing call fires
  vi.advanceTimersByTime(2000);
  expect(invalidateMock).toHaveBeenCalledTimes(2);

  vi.useRealTimers();
});

it("does not fire trailing call if no events arrived during throttle window", () => {
  vi.useFakeTimers();
  renderHook(() => { useSSE({ enabled: true }); });

  eventSourceListeners.get("job:completed")?.({});
  expect(invalidateMock).toHaveBeenCalledTimes(1);

  // No more events — advancing past throttle window should not trigger another call
  vi.advanceTimersByTime(2000);
  expect(invalidateMock).toHaveBeenCalledTimes(1);

  vi.useRealTimers();
});

it("does not create EventSource when enabled=false", () => {
  renderHook(() => { useSSE({ enabled: false }); });
  expect(addEventListenerMock).not.toHaveBeenCalled();
});

it("calls es.close() on unmount", () => {
  const { unmount } = renderHook(() => { useSSE({ enabled: true }); });
  unmount();
  expect(closeMock).toHaveBeenCalled();
});

it("cancels pending throttled call on unmount", () => {
  vi.useFakeTimers();
  const { unmount } = renderHook(() => { useSSE({ enabled: true }); });

  // First event fires immediately
  eventSourceListeners.get("job:completed")?.({});
  expect(invalidateMock).toHaveBeenCalledTimes(1);

  // Second event is throttled (pending)
  eventSourceListeners.get("job:progress")?.({});

  // Unmount before the trailing call fires
  unmount();

  // Advancing past throttle window should NOT trigger the pending call
  vi.advanceTimersByTime(2000);
  expect(invalidateMock).toHaveBeenCalledTimes(1);

  vi.useRealTimers();
});

it("calling onerror does nothing (no throw)", () => {
  const instances: FakeEventSource[] = [];
  const OriginalFake = FakeEventSource;
  vi.stubGlobal("EventSource", class extends OriginalFake {
    constructor(url: string) {
      super(url);
      instances.push(this as FakeEventSource);
    }
  });

  renderHook(() => { useSSE({ enabled: true }); });
  const capturedInstance = instances[instances.length - 1];
  const onerror = capturedInstance?.onerror;
  expect(() => onerror?.({})).not.toThrow();

  vi.stubGlobal("EventSource", FakeEventSource);
});
