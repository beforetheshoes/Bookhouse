// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DataTableColumnPicker } from "./data-table-column-picker";

const columns = [
  { id: "authors", label: "Author(s)" },
  { id: "formats", label: "Format" },
  { id: "publisher", label: "Publisher" },
  { id: "isbn", label: "ISBN" },
];

describe("DataTableColumnPicker", () => {
  it("renders a trigger button", () => {
    render(
      <DataTableColumnPicker
        columns={columns}
        columnVisibility={{}}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /columns/i })).toBeTruthy();
  });

  it("shows all columns as checked when columnVisibility is empty (all visible)", async () => {
    const user = userEvent.setup();
    render(
      <DataTableColumnPicker
        columns={columns}
        columnVisibility={{}}
        onToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /columns/i }));
    for (const col of columns) {
      const item = screen.getByRole("menuitemcheckbox", { name: col.label });
      expect(item.dataset.state).toBe("checked");
    }
  });

  it("shows unchecked for columns marked false in columnVisibility", async () => {
    const user = userEvent.setup();
    render(
      <DataTableColumnPicker
        columns={columns}
        columnVisibility={{ isbn: false }}
        onToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /columns/i }));
    expect(
      screen.getByRole("menuitemcheckbox", { name: "ISBN" }).dataset.state,
    ).toBe("unchecked");
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Author(s)" }).dataset.state,
    ).toBe("checked");
  });

  it("calls onToggle with column id when a checkbox item is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <DataTableColumnPicker
        columns={columns}
        columnVisibility={{}}
        onToggle={onToggle}
      />,
    );
    await user.click(screen.getByRole("button", { name: /columns/i }));
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: "Publisher" }),
    );
    expect(onToggle).toHaveBeenCalledWith("publisher");
  });
});
