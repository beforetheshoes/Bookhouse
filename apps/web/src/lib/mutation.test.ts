import { describe, it, expect, vi, beforeEach } from "vitest";

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { runMutation } from "./mutation";

describe("runMutation", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("returns result and calls toast.success on success", async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1 });
    const result = await runMutation(fn, { success: "Saved!" });
    expect(result).toEqual({ id: 1 });
    expect(toastSuccessMock).toHaveBeenCalledWith("Saved!");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("returns null and calls toast.error with description on Error failure", async () => {
    const err = new Error("something broke");
    const fn = vi.fn().mockRejectedValue(err);
    const result = await runMutation(fn, { success: "Done" });
    expect(result).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith("Something went wrong", {
      description: "something broke",
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("returns null and calls toast.error without description on non-Error failure", async () => {
    const fn = vi.fn().mockRejectedValue("a plain string error");
    const result = await runMutation(fn, { success: "Done" });
    expect(result).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Something went wrong",
      undefined,
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("uses custom error message when opts.error is provided", async () => {
    const err = new Error("db failure");
    const fn = vi.fn().mockRejectedValue(err);
    const result = await runMutation(fn, {
      success: "Done",
      error: "Custom error message",
    });
    expect(result).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith("Custom error message", {
      description: "db failure",
    });
  });
});
