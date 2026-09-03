// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("runs the action, closes on success and disables both buttons while pending", async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Delete shelf" description="Gone for good." confirmLabel="Delete" destructive onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => { expect(screen.getByTestId("confirm-dialog-confirm").hasAttribute("disabled")).toBe(true); });
    expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(true);
    // Escape / overlay are ignored mid-flight.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    finish();
    await waitFor(() => { expect(onOpenChange).toHaveBeenCalledWith(false); });
  });

  it("stays open when the action reports failure", async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Remove" description="…" onConfirm={() => Promise.resolve(false)} />,
    );
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => { expect(screen.getByTestId("confirm-dialog-confirm").hasAttribute("disabled")).toBe(false); });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("cancels and dismisses while idle", () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Remove" description="…" onConfirm={() => Promise.resolve()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });
});
