// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RouteErrorBoundary } from "./route-error-boundary";

/** Force-cast for testing type-mismatch scenarios */
function forceCast<T>(value: T | string | number | boolean | object): T {
  return value as T & typeof value;
}

const mockInvalidate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    useRouter: () => ({ invalidate: mockInvalidate, navigate: vi.fn() }),
  };
});

describe("RouteErrorBoundary", () => {
  it("renders 'Something went wrong' heading", () => {
    render(
      <RouteErrorBoundary
        error={new Error("Test error")}
        reset={vi.fn()}
        info={{ componentStack: "" }}
      />
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("shows error message when DEV is true", () => {
    render(
      <RouteErrorBoundary
        error={new Error("Test error message")}
        reset={vi.fn()}
        info={{ componentStack: "" }}
      />
    );
    expect(screen.getByText("Test error message")).toBeTruthy();
  });

  it("shows generic message when error is not an Error instance", () => {
    render(
      <RouteErrorBoundary
        error={forceCast<Error>("plain string error")}
        reset={vi.fn()}
        info={{ componentStack: "" }}
      />
    );
    expect(screen.getByText("An unexpected error occurred. Please try again.")).toBeTruthy();
  });

  it("retry button calls reset and router.invalidate", () => {
    const reset = vi.fn();
    mockInvalidate.mockClear();

    render(
      <RouteErrorBoundary
        error={new Error("Test error")}
        reset={reset}
        info={{ componentStack: "" }}
      />
    );

    const tryAgainBtn = screen.getByText("Try again");
    fireEvent.click(tryAgainBtn);
    expect(reset).toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalled();
  });
});
