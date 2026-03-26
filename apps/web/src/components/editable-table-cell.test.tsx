// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { toast } from "sonner";
import { EditableTableCell } from "./editable-table-cell";

const mockToastError = (toast as unknown as { error: ReturnType<typeof vi.fn> }).error;

beforeEach(() => {
  mockToastError.mockReset();
});

describe("EditableTableCell", () => {
  it("renders plain text when editing is false", () => {
    render(<EditableTableCell value="Hello" editing={false} onSave={vi.fn()} />);
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders input when editing is true", () => {
    render(<EditableTableCell value="Hello" editing={true} onSave={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByDisplayValue("Hello")).toBeTruthy();
  });

  it("saves on blur when value changed", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableTableCell value="Hello" editing={true} onSave={onSave} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("World");
    });
  });

  it("does not save on blur when value unchanged", () => {
    const onSave = vi.fn();
    render(<EditableTableCell value="Hello" editing={true} onSave={onSave} />);

    fireEvent.blur(screen.getByRole("textbox"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows error toast when save fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("DB error"));
    render(<EditableTableCell value="Hello" editing={true} onSave={onSave} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("DB error");
    });
  });

  it("shows generic error toast on non-Error failure", async () => {
    const onSave = vi.fn().mockRejectedValue("unexpected");
    render(<EditableTableCell value="Hello" editing={true} onSave={onSave} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to save");
    });
  });

  it("renders dash for empty value when not editing", () => {
    render(<EditableTableCell value="" editing={false} onSave={vi.fn()} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders empty input for empty value when editing", () => {
    render(<EditableTableCell value="" editing={true} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("")).toBeTruthy();
  });
});
