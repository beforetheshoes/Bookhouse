// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { useSSE } from "./use-sse";

const addEventListenerMock = vi.fn();
const closeMock = vi.fn();
const eventSourceListeners: Record<string, Function> = {};

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  onerror: Function | null = null;
  constructor(public url: string) {}
  addEventListener = vi.fn((type: string, handler: Function) => {
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
  let capturedInstance: FakeEventSource | null = null;
  const OriginalFake = FakeEventSource;
  vi.stubGlobal("EventSource", class extends OriginalFake {
    constructor(url: string) {
      super(url);
      capturedInstance = this;
    }
  });

  renderHook(() => useSSE({ enabled: true }));
  expect(capturedInstance).not.toBeNull();
  expect(capturedInstance!.onerror).toBeTypeOf("function");

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
  let capturedInstance: FakeEventSource | null = null;
  const OriginalFake = FakeEventSource;
  vi.stubGlobal("EventSource", class extends OriginalFake {
    constructor(url: string) {
      super(url);
      capturedInstance = this;
    }
  });

  renderHook(() => useSSE({ enabled: true }));
  expect(() => capturedInstance!.onerror!({})).not.toThrow();

  vi.stubGlobal("EventSource", FakeEventSource);
});
