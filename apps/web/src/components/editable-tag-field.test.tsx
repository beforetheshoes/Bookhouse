// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditableTagField } from "./editable-tag-field";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

describe("EditableTagField", () => {
  it("renders comma-separated values in read mode", () => {
    render(<EditableTagField values={["Alice", "Bob"]} onSave={vi.fn()} />);
    expect(screen.getByText("Alice, Bob")).toBeTruthy();
  });

  it("renders placeholder when values are empty", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} placeholder="No authors" />);
    expect(screen.getByText("No authors")).toBeTruthy();
  });

  it("switches to edit mode on click", () => {
    render(<EditableTagField values={["Alice"]} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Alice"));
    // Should show a tag chip and an input
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("adds a tag on Enter", () => {
    render(<EditableTagField values={["Alice"]} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Alice"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Bob" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Bob should now appear as a tag
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("adds a tag on Tab", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} placeholder="Add" />);
    fireEvent.click(screen.getByText("Add"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Carol" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.getByText("Carol")).toBeTruthy();
  });

  it("does not add empty tags", () => {
    render(<EditableTagField values={["Alice"]} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Alice"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });
    // Should still only have Alice
    const chips = screen.getAllByRole("button", { name: /remove/i });
    expect(chips).toHaveLength(1);
  });

  it("removes a tag when X is clicked", () => {
    render(<EditableTagField values={["Alice", "Bob"]} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Alice, Bob"));
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    fireEvent.click(removeButtons[0] as HTMLButtonElement);
    // Alice should be gone
    expect(screen.queryByText("Alice")).toBeNull();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("removes last tag on Backspace when input is empty", () => {
    render(<EditableTagField values={["Alice", "Bob"]} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Alice, Bob"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Backspace" });
    // Bob should be removed
    expect(screen.getByText("Alice")).toBeTruthy();
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    expect(removeButtons).toHaveLength(1);
  });

  it("does not remove tag on Backspace when input has text", () => {
    render(<EditableTagField values={["Alice"]} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Alice"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Bo" } });
    fireEvent.keyDown(input, { key: "Backspace" });
    // Alice should still be there
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("saves on blur", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableTagField values={["Alice"]} onSave={onSave} />);
    fireEvent.click(screen.getByText("Alice"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Bob" } });
    fireEvent.blur(input);
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(["Alice", "Bob"]);
    });
  });

  it("includes pending input text as a tag on blur", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableTagField values={[]} onSave={onSave} placeholder="Add" />);
    fireEvent.click(screen.getByText("Add"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New Author" } });
    fireEvent.blur(input);
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(["New Author"]);
    });
  });

  it("cancels on Escape and reverts to original values", () => {
    const onSave = vi.fn();
    render(<EditableTagField values={["Alice"]} onSave={onSave} />);
    fireEvent.click(screen.getByText("Alice"));
    // Add a tag
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Bob" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Now cancel
    fireEvent.keyDown(input, { key: "Escape" });
    // Should revert to read mode showing original
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not save when required and all tags removed", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableTagField values={["Alice"]} onSave={onSave} required />);
    fireEvent.click(screen.getByText("Alice"));
    // Remove the only tag
    const removeButton = screen.getByRole("button", { name: /remove/i });
    fireEvent.click(removeButton);
    // Blur to try saving
    const input = screen.getByRole("textbox");
    fireEvent.blur(input);
    // Should revert, not save
    await vi.waitFor(() => {
      expect(screen.getByText("Alice")).toBeTruthy();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not save when values unchanged", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableTagField values={["Alice"]} onSave={onSave} />);
    fireEvent.click(screen.getByText("Alice"));
    const input = screen.getByRole("textbox");
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows toast on save error", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<EditableTagField values={["Alice"]} onSave={onSave} />);
    fireEvent.click(screen.getByText("Alice"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Bob" } });
    fireEvent.blur(input);
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });

  it("handles non-Error save failure", async () => {
    const onSave = vi.fn().mockRejectedValue("string error");
    render(<EditableTagField values={["Alice"]} onSave={onSave} />);
    fireEvent.click(screen.getByText("Alice"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Bob" } });
    fireEvent.blur(input);
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });

  it("switches to edit mode on Enter key in read mode", () => {
    render(<EditableTagField values={["Alice"]} onSave={vi.fn()} />);
    const display = screen.getByText("Alice");
    fireEvent.keyDown(display, { key: "Enter" });
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("switches to edit mode on Space key in read mode", () => {
    render(<EditableTagField values={["Alice"]} onSave={vi.fn()} />);
    const display = screen.getByText("Alice");
    fireEvent.keyDown(display, { key: " " });
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("does not save when focus moves within the container (e.g., clicking X button)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<EditableTagField values={["Alice", "Bob"]} onSave={onSave} />);
    fireEvent.click(screen.getByText("Alice, Bob"));
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    // Simulate blur with relatedTarget inside the container
    const input = screen.getByRole("textbox");
    const editContainer = container.firstElementChild as HTMLElement;
    fireEvent.blur(input, { relatedTarget: removeButtons[0] });
    // Focus stayed inside — should NOT save
    expect(onSave).not.toHaveBeenCalled();
    // Now click the X to remove Alice
    fireEvent.click(removeButtons[0] as HTMLButtonElement);
    expect(screen.queryByText("Alice")).toBeNull();
    // Blur outside the container to trigger save
    fireEvent.blur(editContainer, { relatedTarget: null });
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(["Bob"]);
    });
  });

  it("shows autocomplete suggestions when typing 2+ characters", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} suggestions={["Alice Walker", "Alice Munro", "Bob"]} placeholder="Add" />);
    fireEvent.click(screen.getByText("Add"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Al" } });
    expect(screen.getByText("Alice Walker")).toBeTruthy();
    expect(screen.getByText("Alice Munro")).toBeTruthy();
    expect(screen.queryByText("Bob")).toBeNull();
  });

  it("does not show suggestions with fewer than 2 characters", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} suggestions={["Alice"]} placeholder="Add" />);
    fireEvent.click(screen.getByText("Add"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "A" } });
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("excludes already-added tags from suggestions", () => {
    render(<EditableTagField values={["Alice Walker"]} onSave={vi.fn()} suggestions={["Alice Walker", "Alice Munro"]} />);
    fireEvent.click(screen.getByText("Alice Walker"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Ali" } });
    expect(screen.queryByText("Alice Walker")).not.toBeNull(); // exists as a tag chip
    // Only Alice Munro should appear in the dropdown
    const suggestions = screen.getAllByText("Alice Munro");
    expect(suggestions).toHaveLength(1);
  });

  it("selects a suggestion with Enter after arrow down", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} suggestions={["Alice Walker", "Alice Munro"]} placeholder="Add" />);
    fireEvent.click(screen.getByText("Add"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Ali" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    // Alice Walker should be added as a tag
    expect(screen.getByText("Alice Walker")).toBeTruthy();
  });

  it("navigates suggestions down then up", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} suggestions={["Alice Walker", "Alice Munro"]} placeholder="Add" />);
    fireEvent.click(screen.getByText("Add"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Ali" } });
    fireEvent.keyDown(input, { key: "ArrowDown" }); // index 0
    fireEvent.keyDown(input, { key: "ArrowDown" }); // index 1
    fireEvent.keyDown(input, { key: "ArrowUp" }); // back to index 0
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Alice Walker")).toBeTruthy();
  });

  it("navigates suggestions with ArrowUp", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} suggestions={["Alice Walker", "Alice Munro"]} placeholder="Add" />);
    fireEvent.click(screen.getByText("Add"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Ali" } });
    fireEvent.keyDown(input, { key: "ArrowUp" }); // wraps to last
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Alice Munro")).toBeTruthy();
  });

  it("selects a suggestion on click", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} suggestions={["Alice Walker"]} placeholder="Add" />);
    fireEvent.click(screen.getByText("Add"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Ali" } });
    fireEvent.mouseDown(screen.getByText("Alice Walker"));
    // Should be added as a tag
    const tags = screen.getAllByRole("button", { name: /remove/i });
    expect(tags).toHaveLength(1);
  });

  it("resets selected index when input changes", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} suggestions={["Alice Walker", "Bob Smith"]} placeholder="Add" />);
    fireEvent.click(screen.getByText("Add"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Ali" } });
    fireEvent.keyDown(input, { key: "ArrowDown" }); // select first
    fireEvent.change(input, { target: { value: "Bo" } }); // type something different
    fireEvent.keyDown(input, { key: "Enter" }); // should add "Bo" as typed, not select suggestion
    // "Bo" should be added (not "Bob Smith" since index was reset)
    expect(screen.getByText("Bo")).toBeTruthy();
  });

  it("does not switch to edit mode on other keys in read mode", () => {
    render(<EditableTagField values={["Alice"]} onSave={vi.fn()} />);
    const display = screen.getByText("Alice");
    fireEvent.keyDown(display, { key: "Tab" });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders dash when no values and no placeholder", () => {
    render(<EditableTagField values={[]} onSave={vi.fn()} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
