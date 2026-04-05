// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  getEditionColumns,
  getEditionAuthors,
  getEditionNarrators,
  formatPagesOrDuration,
  EDITION_COLUMN_PICKER_ITEMS,
} from "./library-edition-columns";
import type { LibraryEdition } from "~/lib/server-fns/library";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children?: React.ReactNode; to?: string; params?: object; search?: object; className?: string }) => (
    <a href={props.to} {...props}>{children}</a>
  ),
}));

vi.mock("~/components/data-table", () => ({
  DataTableColumnHeader: ({ title }: { title: string }) => <span>{title}</span>,
}));

const updateEditionServerFnMock = vi.fn().mockResolvedValue({});
const updateWorkAuthorsServerFnMock = vi.fn().mockResolvedValue({});
const updateEditionNarratorsServerFnMock = vi.fn().mockResolvedValue({});
vi.mock("~/lib/server-fns/editing", () => ({
  updateEditionServerFn: (args: object): Promise<object> => updateEditionServerFnMock(args) as Promise<object>,
  updateWorkAuthorsServerFn: (args: object): Promise<object> => updateWorkAuthorsServerFnMock(args) as Promise<object>,
  updateEditionNarratorsServerFn: (args: object): Promise<object> => updateEditionNarratorsServerFnMock(args) as Promise<object>,
}));

const mockRouter = { invalidate: vi.fn() };

const makeEdition = (overrides?: Partial<LibraryEdition>): LibraryEdition =>
  ({
    id: "e-1",
    workId: "w-1",
    formatFamily: "EBOOK",
    publisher: "Penguin",
    publishedAt: new Date("2024-01-15"),
    isbn13: "9780123456789",
    isbn10: "0123456789",
    asin: "B01ABCDEFG",
    language: "en",
    pageCount: 300,
    duration: null,
    editedFields: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    work: {
      titleDisplay: "Test Book",
      titleCanonical: "test book",
      sortTitle: null,
      id: "w-1",
      description: null,
      coverPath: null,
      coverColors: null,
      seriesId: null,
      seriesPosition: null,
      enrichmentStatus: "ENRICHED",
      editedFields: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      series: null,
      editions: [
        {
          id: "e-1",
          contributors: [
            { id: "ec-1", editionId: "e-1", contributorId: "c-1", role: "AUTHOR", contributor: { id: "c-1", nameDisplay: "Alice", nameCanonical: "alice", editedFields: [], createdAt: new Date(), updatedAt: new Date() } },
          ],
        },
      ],
    },
    contributors: [
      { id: "ec-1", editionId: "e-1", contributorId: "c-1", role: "AUTHOR", contributor: { id: "c-1", nameDisplay: "Alice", nameCanonical: "alice", editedFields: [], createdAt: new Date(), updatedAt: new Date() } },
      { id: "ec-2", editionId: "e-1", contributorId: "c-2", role: "NARRATOR", contributor: { id: "c-2", nameDisplay: "Bob", nameCanonical: "bob", editedFields: [], createdAt: new Date(), updatedAt: new Date() } },
    ],
    ...overrides,
  }) as LibraryEdition;

function TestTable({ data, editMode = false }: { data: LibraryEdition[]; editMode?: boolean }) {
  const columns = getEditionColumns(editMode, mockRouter);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  });
  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => (
              <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe("getEditionAuthors", () => {
  it("aggregates authors from all work editions", () => {
    const edition = {
      contributors: [],
      work: {
        editions: [
          { contributors: [{ role: "AUTHOR", contributor: { nameDisplay: "Alice" } }] },
          { contributors: [{ role: "AUTHOR", contributor: { nameDisplay: "Charlie" } }, { role: "NARRATOR", contributor: { nameDisplay: "Bob" } }] },
        ],
      },
    };
    expect(getEditionAuthors(edition as Parameters<typeof getEditionAuthors>[0])).toBe("Alice, Charlie");
  });

  it("deduplicates authors across editions", () => {
    const edition = {
      contributors: [],
      work: {
        editions: [
          { contributors: [{ role: "AUTHOR", contributor: { nameDisplay: "Alice" } }] },
          { contributors: [{ role: "AUTHOR", contributor: { nameDisplay: "Alice" } }] },
        ],
      },
    };
    expect(getEditionAuthors(edition as Parameters<typeof getEditionAuthors>[0])).toBe("Alice");
  });

  it("returns em dash when no authors across any edition", () => {
    const edition = {
      contributors: [{ role: "NARRATOR", contributor: { nameDisplay: "Bob" } }],
      work: {
        editions: [
          { contributors: [{ role: "NARRATOR", contributor: { nameDisplay: "Bob" } }] },
        ],
      },
    };
    expect(getEditionAuthors(edition as Parameters<typeof getEditionAuthors>[0])).toBe("\u2014");
  });

  it("returns em dash for work with no edition contributors", () => {
    const edition = {
      contributors: [],
      work: { editions: [{ contributors: [] }] },
    };
    expect(getEditionAuthors(edition as Parameters<typeof getEditionAuthors>[0])).toBe("\u2014");
  });
});

describe("getEditionNarrators", () => {
  it("extracts NARRATOR contributors", () => {
    const edition = {
      contributors: [
        { role: "AUTHOR", contributor: { nameDisplay: "Alice" } },
        { role: "NARRATOR", contributor: { nameDisplay: "Bob" } },
        { role: "NARRATOR", contributor: { nameDisplay: "Charlie" } },
      ],
    };
    expect(getEditionNarrators(edition as Parameters<typeof getEditionNarrators>[0])).toBe("Bob, Charlie");
  });

  it("returns em dash when no narrators", () => {
    const edition = {
      contributors: [{ role: "AUTHOR", contributor: { nameDisplay: "Alice" } }],
    };
    expect(getEditionNarrators(edition as Parameters<typeof getEditionNarrators>[0])).toBe("\u2014");
  });
});

describe("formatPagesOrDuration", () => {
  it("returns page count for EBOOK", () => {
    expect(formatPagesOrDuration("EBOOK", 350, null)).toBe("350 pages");
  });

  it("returns formatted duration for AUDIOBOOK", () => {
    expect(formatPagesOrDuration("AUDIOBOOK", null, 45000)).toBe("12h 30m");
  });

  it("returns em dash for EBOOK without pageCount", () => {
    expect(formatPagesOrDuration("EBOOK", null, null)).toBe("\u2014");
  });

  it("returns em dash for AUDIOBOOK without duration", () => {
    expect(formatPagesOrDuration("AUDIOBOOK", null, null)).toBe("\u2014");
  });

  it("returns page count string for 1 page", () => {
    expect(formatPagesOrDuration("EBOOK", 1, null)).toBe("1 page");
  });
});

describe("getEditionColumns", () => {
  it("returns expected column IDs", () => {
    const columns = getEditionColumns(false, mockRouter);
    const ids = columns.map((c) => c.id ?? (c as { accessorKey?: string }).accessorKey);
    expect(ids).toEqual([
      "select",
      "titleDisplay",
      "authors",
      "format",
      "publisher",
      "publishDate",
      "pagesOrDuration",
      "narrators",
      "isbn13",
      "isbn10",
      "asin",
    ]);
  });

  it("select column is not sortable or hideable", () => {
    const columns = getEditionColumns(false, mockRouter);
    const select = columns.find((c) => c.id === "select");
    expect(select).toBeDefined();
    expect(select?.enableSorting).toBe(false);
    expect(select?.enableHiding).toBe(false);
  });

  it("titleDisplay column is not hideable", () => {
    const columns = getEditionColumns(false, mockRouter);
    const title = columns.find((c) => c.id === "titleDisplay");
    expect(title).toBeDefined();
    expect(title?.enableHiding).toBe(false);
  });

  it.each([
    ["publisher", (e: LibraryEdition) => e.publisher ?? "\u2014"],
    ["isbn13", (e: LibraryEdition) => e.isbn13 ?? "\u2014"],
    ["isbn10", (e: LibraryEdition) => e.isbn10 ?? "\u2014"],
    ["asin", (e: LibraryEdition) => e.asin ?? "\u2014"],
  ] as const)("accessorFn for %s returns em dash for null", (colId, expectedFn) => {
    const columns = getEditionColumns(false, mockRouter);
    const col = columns.find((c) => c.id === colId);
    const accessorFn = (col as { accessorFn?: (row: LibraryEdition) => string }).accessorFn;
    expect(accessorFn?.(makeEdition({ [colId]: null } as Partial<LibraryEdition>))).toBe("\u2014");
    expect(accessorFn?.(makeEdition())).toBe(expectedFn(makeEdition()));
  });

  it("accessorFn for publishDate returns the date", () => {
    const columns = getEditionColumns(false, mockRouter);
    const col = columns.find((c) => c.id === "publishDate");
    const accessorFn = (col as { accessorFn?: (row: LibraryEdition) => Date | null }).accessorFn;
    const date = new Date("2024-01-15");
    expect(accessorFn?.(makeEdition({ publishedAt: date }))).toBe(date);
    expect(accessorFn?.(makeEdition({ publishedAt: null }))).toBeNull();
  });

  it("accessorFn for pagesOrDuration formats correctly", () => {
    const columns = getEditionColumns(false, mockRouter);
    const col = columns.find((c) => c.id === "pagesOrDuration");
    const accessorFn = (col as { accessorFn?: (row: LibraryEdition) => string }).accessorFn;
    expect(accessorFn?.(makeEdition({ formatFamily: "EBOOK", pageCount: 200, duration: null }))).toBe("200 pages");
    expect(accessorFn?.(makeEdition({ formatFamily: "AUDIOBOOK", pageCount: null, duration: 3600 }))).toBe("1h");
  });

  it("accessorFn for narrators extracts narrators", () => {
    const columns = getEditionColumns(false, mockRouter);
    const col = columns.find((c) => c.id === "narrators");
    const accessorFn = (col as { accessorFn?: (row: LibraryEdition) => string }).accessorFn;
    expect(accessorFn?.(makeEdition())).toBe("Bob");
  });

  it("accessorFn for titleDisplay returns work title", () => {
    const columns = getEditionColumns(false, mockRouter);
    const col = columns.find((c) => c.id === "titleDisplay");
    const accessorFn = (col as { accessorFn?: (row: LibraryEdition) => string }).accessorFn;
    expect(accessorFn?.(makeEdition())).toBe("Test Book");
  });

  it("accessorFn for authors extracts authors", () => {
    const columns = getEditionColumns(false, mockRouter);
    const col = columns.find((c) => c.id === "authors");
    const accessorFn = (col as { accessorFn?: (row: LibraryEdition) => string }).accessorFn;
    expect(accessorFn?.(makeEdition())).toBe("Alice");
  });

  it("accessorFn for format returns formatFamily", () => {
    const columns = getEditionColumns(false, mockRouter);
    const col = columns.find((c) => c.id === "format");
    const accessorFn = (col as { accessorFn?: (row: LibraryEdition) => string }).accessorFn;
    expect(accessorFn?.(makeEdition())).toBe("EBOOK");
  });
});

describe("edition columns rendering", () => {
  it("renders all column cells for an ebook edition", () => {
    render(<TestTable data={[makeEdition()]} />);
    expect(screen.getByText("Test Book")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("EBOOK")).toBeTruthy();
    expect(screen.getByText("Penguin")).toBeTruthy();
    expect(screen.getByText("300 pages")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("9780123456789")).toBeTruthy();
    expect(screen.getByText("0123456789")).toBeTruthy();
    expect(screen.getByText("B01ABCDEFG")).toBeTruthy();
  });

  it("renders duration for audiobook edition", () => {
    render(<TestTable data={[makeEdition({ formatFamily: "AUDIOBOOK", pageCount: null, duration: 36000 })]} />);
    expect(screen.getByText("10h")).toBeTruthy();
  });

  it("renders em dash for null publisher", () => {
    render(<TestTable data={[makeEdition({ publisher: null })]} />);
    const cells = screen.getAllByText("\u2014");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("renders em dash for null isbn13, isbn10, asin", () => {
    render(<TestTable data={[makeEdition({ isbn13: null, isbn10: null, asin: null })]} />);
    // publisher is still "Penguin", publishedAt has a value, but isbn/asin should show dashes
    const cells = screen.getAllByText("\u2014");
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  it("renders em dash for null publishedAt", () => {
    render(<TestTable data={[makeEdition({ publishedAt: null })]} />);
    const cells = screen.getAllByText("\u2014");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("select all checkbox toggles all rows", () => {
    render(<TestTable data={[makeEdition()]} />);
    const selectAll = screen.getByLabelText("Select all");
    fireEvent.click(selectAll);
    const rowCheckbox = screen.getByLabelText("Select row");
    expect((rowCheckbox as HTMLInputElement).checked).toBe(true);
  });

  it("select row checkbox toggles individual row", () => {
    render(<TestTable data={[makeEdition()]} />);
    const rowCheckbox = screen.getByLabelText("Select row");
    fireEvent.click(rowCheckbox);
    expect((rowCheckbox as HTMLInputElement).checked).toBe(true);
  });

  it("renders column headers including ISBN and ASIN", () => {
    render(<TestTable data={[makeEdition()]} />);
    expect(screen.getByText("Title")).toBeTruthy();
    expect(screen.getByText("Author(s)")).toBeTruthy();
    expect(screen.getByText("Format")).toBeTruthy();
    expect(screen.getByText("Publisher")).toBeTruthy();
    expect(screen.getByText("Publish Date")).toBeTruthy();
    expect(screen.getByText("Pages / Duration")).toBeTruthy();
    expect(screen.getByText("Narrator(s)")).toBeTruthy();
    expect(screen.getByText("ISBN-13")).toBeTruthy();
    expect(screen.getByText("ISBN-10")).toBeTruthy();
    expect(screen.getByText("ASIN")).toBeTruthy();
  });

  it("renders editable inputs when editMode is true", () => {
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    // publisher, publishDate, pagesOrDuration, authors, narrators, isbn13, isbn10, asin = 8 inputs
    expect(inputs.length).toBe(8);
  });

  it("editable publisher saves via updateEditionServerFn", async () => {
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    // publisher is the 3rd editable field (after authors, then publisher)
    const publisherInput = inputs.find((input) => (input as HTMLInputElement).value === "Penguin");
    expect(publisherInput).toBeDefined();
    fireEvent.change(publisherInput as HTMLInputElement, { target: { value: "New Press" } });
    fireEvent.blur(publisherInput as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", fields: { publisher: "New Press" } },
      });
    });
  });

  it("editable isbn13 saves via updateEditionServerFn", async () => {
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const isbn13Input = inputs.find((input) => (input as HTMLInputElement).value === "9780123456789");
    expect(isbn13Input).toBeDefined();
    fireEvent.change(isbn13Input as HTMLInputElement, { target: { value: "9780000000000" } });
    fireEvent.blur(isbn13Input as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", fields: { isbn13: "9780000000000" } },
      });
    });
  });

  it("editable authors saves via updateWorkAuthorsServerFn", async () => {
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const authorsInput = inputs.find((input) => (input as HTMLInputElement).value === "Alice");
    expect(authorsInput).toBeDefined();
    fireEvent.change(authorsInput as HTMLInputElement, { target: { value: "Alice, Charlie" } });
    fireEvent.blur(authorsInput as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateWorkAuthorsServerFnMock).toHaveBeenCalledWith({
        data: { workId: "w-1", authors: ["Alice", "Charlie"] },
      });
    });
  });

  it("editable narrators saves via updateEditionNarratorsServerFn", async () => {
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const narratorsInput = inputs.find((input) => (input as HTMLInputElement).value === "Bob");
    expect(narratorsInput).toBeDefined();
    fireEvent.change(narratorsInput as HTMLInputElement, { target: { value: "Bob, Carol" } });
    fireEvent.blur(narratorsInput as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionNarratorsServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", narrators: ["Bob", "Carol"] },
      });
    });
  });

  it("editable pagesOrDuration saves pageCount for ebooks", async () => {
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const pagesInput = inputs.find((input) => (input as HTMLInputElement).value === "300");
    expect(pagesInput).toBeDefined();
    fireEvent.change(pagesInput as HTMLInputElement, { target: { value: "400" } });
    fireEvent.blur(pagesInput as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", fields: { pageCount: "400" } },
      });
    });
  });

  it("editable isbn10 saves via updateEditionServerFn", async () => {
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const isbn10Input = inputs.find((input) => (input as HTMLInputElement).value === "0123456789");
    expect(isbn10Input).toBeDefined();
    fireEvent.change(isbn10Input as HTMLInputElement, { target: { value: "0000000000" } });
    fireEvent.blur(isbn10Input as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", fields: { isbn10: "0000000000" } },
      });
    });
  });

  it("editable asin saves via updateEditionServerFn", async () => {
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const asinInput = inputs.find((input) => (input as HTMLInputElement).value === "B01ABCDEFG");
    expect(asinInput).toBeDefined();
    fireEvent.change(asinInput as HTMLInputElement, { target: { value: "B99ZZZZZZZ" } });
    fireEvent.blur(asinInput as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", fields: { asin: "B99ZZZZZZZ" } },
      });
    });
  });

  it("editable publishDate saves via updateEditionServerFn", async () => {
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const dateInput = inputs.find((input) => (input as HTMLInputElement).value === "2024-01-15");
    expect(dateInput).toBeDefined();
    fireEvent.change(dateInput as HTMLInputElement, { target: { value: "2025-06-01" } });
    fireEvent.blur(dateInput as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", fields: { publishedAt: "2025-06-01" } },
      });
    });
  });

  it("empty author save is a no-op", async () => {
    updateWorkAuthorsServerFnMock.mockClear();
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const authorsInput = inputs.find((input) => (input as HTMLInputElement).value === "Alice");
    expect(authorsInput).toBeDefined();
    fireEvent.change(authorsInput as HTMLInputElement, { target: { value: "" } });
    fireEvent.blur(authorsInput as HTMLInputElement);
    // Small delay to ensure no async call was made
    await new Promise((r) => { setTimeout(r, 50); });
    expect(updateWorkAuthorsServerFnMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Penguin", "publisher"],
    ["9780123456789", "isbn13"],
    ["0123456789", "isbn10"],
    ["B01ABCDEFG", "asin"],
    ["2024-01-15", "publishedAt"],
  ] as const)("clearing %s sends null for %s", async (currentValue, field) => {
    updateEditionServerFnMock.mockClear();
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const input = inputs.find((el) => (el as HTMLInputElement).value === currentValue);
    expect(input).toBeDefined();
    fireEvent.change(input as HTMLInputElement, { target: { value: "" } });
    fireEvent.blur(input as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", fields: { [field]: null } },
      });
    });
  });

  it("renders empty inputs for null fields in edit mode", () => {
    const edition = {
      ...makeEdition({
        isbn13: null, isbn10: null, asin: null, publisher: null, publishedAt: null,
        pageCount: null, duration: null,
        contributors: [],
      }),
      work: {
        ...makeEdition().work,
        editions: [{ ...makeEdition(), contributors: [] }],
      },
    } as LibraryEdition;
    render(<TestTable data={[edition]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const emptyInputs = inputs.filter((el) => (el as HTMLInputElement).value === "");
    // authors, publisher, publishDate, pageCount, narrators, isbn13, isbn10, asin = 8 empty
    expect(emptyInputs.length).toBeGreaterThanOrEqual(8);
  });

  it("renders empty duration input for audiobook with null duration in edit mode", () => {
    const edition = makeEdition({ formatFamily: "AUDIOBOOK", duration: null, pageCount: null });
    render(<TestTable data={[edition]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    // The duration field should be empty
    const emptyInputs = inputs.filter((el) => (el as HTMLInputElement).value === "");
    expect(emptyInputs.length).toBeGreaterThanOrEqual(1);
  });

  it("clearing pagesOrDuration sends null", async () => {
    updateEditionServerFnMock.mockClear();
    render(<TestTable data={[makeEdition()]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const pagesInput = inputs.find((el) => (el as HTMLInputElement).value === "300");
    expect(pagesInput).toBeDefined();
    fireEvent.change(pagesInput as HTMLInputElement, { target: { value: "" } });
    fireEvent.blur(pagesInput as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", fields: { pageCount: null } },
      });
    });
  });

  it("editable pagesOrDuration saves duration for audiobooks", async () => {
    render(<TestTable data={[makeEdition({ formatFamily: "AUDIOBOOK", pageCount: null, duration: 3600 })]} editMode={true} />);
    const inputs = screen.getAllByRole("textbox");
    const durationInput = inputs.find((input) => (input as HTMLInputElement).value === "3600");
    expect(durationInput).toBeDefined();
    fireEvent.change(durationInput as HTMLInputElement, { target: { value: "7200" } });
    fireEvent.blur(durationInput as HTMLInputElement);
    await vi.waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e-1", fields: { duration: "7200" } },
      });
    });
  });
});

describe("EDITION_COLUMN_PICKER_ITEMS", () => {
  it("lists all optional columns", () => {
    const ids = EDITION_COLUMN_PICKER_ITEMS.map((item) => item.id);
    expect(ids).toEqual([
      "authors",
      "format",
      "publisher",
      "publishDate",
      "pagesOrDuration",
      "narrators",
      "isbn13",
      "isbn10",
      "asin",
    ]);
  });
});
