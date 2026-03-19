// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { useSSE } from "./use-sse";

const addEventListenerMock = vi.fn();
const closeMock = vi.fn();
const eventSourceListeners: Record<string, (...args: unknown[]) => unknown> = {};

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  onerror: ((...args: unknown[]) => unknown) | null = null;
  constructor(public url: string) {}
  addEventListener = vi.fn((type: string, handler: (...args: unknown[]) => unknown) => {
    eventSourceListeners[type] = handler;
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
  for (const key of Object.keys(eventSourceListeners)) {
    delete eventSourceListeners[key];
  }
});

it("creates EventSource and registers 3 event listeners when enabled=true", () => {
  renderHook(() => useSSE({ enabled: true }));

  expect(addEventListenerMock).toHaveBeenCalledTimes(3);
  expect(addEventListenerMock).toHaveBeenCalledWith("job:completed", expect.any(Function));
  expect(addEventListenerMock).toHaveBeenCalledWith("job:failed", expect.any(Function));
  expect(addEventListenerMock).toHaveBeenCalledWith("job:active", expect.any(Function));
});

it("sets onerror on the EventSource", () => {
  const instances: FakeEventSource[] = [];
  const OriginalFake = FakeEventSource;
  vi.stubGlobal("EventSource", class extends OriginalFake {
    constructor(url: string) {
      super(url);
      instances.push(this as unknown as FakeEventSource);
    }
  });

  renderHook(() => useSSE({ enabled: true }));
  expect(instances.length).toBeGreaterThan(0);
  expect(instances[instances.length - 1].onerror).toBeTypeOf("function");

  // Restore original stub
  vi.stubGlobal("EventSource", FakeEventSource);
});

it("calling an event handler calls router.invalidate()", () => {
  renderHook(() => useSSE({ enabled: true }));

  eventSourceListeners["job:completed"]({});
  expect(invalidateMock).toHaveBeenCalledTimes(1);
});

it("does not create EventSource when enabled=false", () => {
  renderHook(() => useSSE({ enabled: false }));
  expect(addEventListenerMock).not.toHaveBeenCalled();
});

it("calls es.close() on unmount", () => {
  const { unmount } = renderHook(() => useSSE({ enabled: true }));
  unmount();
  expect(closeMock).toHaveBeenCalled();
});

it("calling onerror does nothing (no throw)", () => {
  const instances: FakeEventSource[] = [];
  const OriginalFake = FakeEventSource;
  vi.stubGlobal("EventSource", class extends OriginalFake {
    constructor(url: string) {
      super(url);
      instances.push(this as unknown as FakeEventSource);
    }
  });

  renderHook(() => useSSE({ enabled: true }));
  const capturedInstance = instances[instances.length - 1];
  expect(() => capturedInstance.onerror!({})).not.toThrow();

  vi.stubGlobal("EventSource", FakeEventSource);
});
