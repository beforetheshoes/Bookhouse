// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { toast } from "sonner";
import { EditableField } from "./editable-field";

const mockToastError = (toast as unknown as { error: ReturnType<typeof vi.fn> }).error;

beforeEach(() => {
  mockToastError.mockReset();
});

describe("EditableField", () => {
  it("renders value as text when not editing", () => {
    render(<EditableField value="Hello" onSave={vi.fn()} />);
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders placeholder when value is empty", () => {
    render(<EditableField value="" onSave={vi.fn()} placeholder="Enter value" />);
    expect(screen.getByText("Enter value")).toBeTruthy();
  });

  it("switches to input on click", () => {
    render(<EditableField value="Hello" onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Hello"));
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByDisplayValue("Hello")).toBeTruthy();
  });

  it("saves on blur when value changed", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableField value="Hello" onSave={onSave} />);

    fireEvent.click(screen.getByText("Hello"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("World");
    });
  });

  it("does not save on blur when value unchanged", () => {
    const onSave = vi.fn();
    render(<EditableField value="Hello" onSave={onSave} />);

    fireEvent.click(screen.getByText("Hello"));
    fireEvent.blur(screen.getByRole("textbox"));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves on Enter key", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableField value="Hello" onSave={onSave} />);

    fireEvent.click(screen.getByText("Hello"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("World");
    });
  });

  it("reverts on Escape key", () => {
    const onSave = vi.fn();
    render(<EditableField value="Hello" onSave={onSave} />);

    fireEvent.click(screen.getByText("Hello"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows error toast when save fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("DB error"));
    render(<EditableField value="Hello" onSave={onSave} />);

    fireEvent.click(screen.getByText("Hello"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("DB error");
    });
  });

  it("shows generic error toast when save fails with non-Error", async () => {
    const onSave = vi.fn().mockRejectedValue("unexpected");
    render(<EditableField value="Hello" onSave={onSave} />);

    fireEvent.click(screen.getByText("Hello"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to save");
    });
  });

  it("does not save blank value when required is true", () => {
    const onSave = vi.fn();
    render(<EditableField value="Hello" onSave={onSave} required />);

    fireEvent.click(screen.getByText("Hello"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
    // Reverts to original value
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("renders as textarea when renderAs is textarea", () => {
    render(<EditableField value="Long text" onSave={vi.fn()} renderAs="textarea" />);
    fireEvent.click(screen.getByText("Long text"));
    const textarea = screen.getByRole("textbox");
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("applies custom className to display text", () => {
    const { container } = render(<EditableField value="Hello" onSave={vi.fn()} className="custom-class" />);
    const span = container.querySelector(".custom-class");
    expect(span).toBeTruthy();
  });

  it("enters edit mode on Space key press", () => {
    render(<EditableField value="Hello" onSave={vi.fn()} />);
    const span = screen.getByText("Hello");
    fireEvent.keyDown(span, { key: " " });
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("enters edit mode on Enter key press on span", () => {
    render(<EditableField value="Hello" onSave={vi.fn()} />);
    const span = screen.getByText("Hello");
    fireEvent.keyDown(span, { key: "Enter" });
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("does not enter edit mode on other keys", () => {
    render(<EditableField value="Hello" onSave={vi.fn()} />);
    const span = screen.getByText("Hello");
    fireEvent.keyDown(span, { key: "Tab" });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders dash when value is empty and no placeholder", () => {
    render(<EditableField value="" onSave={vi.fn()} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("applies inputClassName to input element", () => {
    render(<EditableField value="Hello" onSave={vi.fn()} inputClassName="input-custom" />);
    fireEvent.click(screen.getByText("Hello"));
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("input-custom");
  });

  it("does not enter edit mode on Enter for textarea", () => {
    const onSave = vi.fn();
    render(<EditableField value="Hello" onSave={onSave} renderAs="textarea" />);
    fireEvent.click(screen.getByText("Hello"));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "World" } });
    // Enter in textarea should NOT trigger save (allows newlines)
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });
});
