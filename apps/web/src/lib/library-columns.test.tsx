// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, params, ...props }: { children?: React.ReactNode; to: string; params?: Record<string, string>; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => {
      let href = to;
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          href = href.replace(`$${key}`, value);
        }
      }
      return <a href={href} {...props}>{children}</a>;
    },
  };
});

vi.mock("~/lib/server-fns/editing", () => ({
  updateWorkServerFn: vi.fn(),
  updateEditionServerFn: vi.fn(),
  updateWorkAuthorsServerFn: vi.fn(),
}));

vi.mock("~/components/editable-table-cell", async () => {
  const actual = await vi.importActual("~/components/editable-table-cell");
  return actual as Record<string, object>;
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { render, screen } from "@testing-library/react";
import { getFormats, COLUMN_PICKER_ITEMS, getColumns } from "./library-columns";

type LibraryWork = Parameters<typeof getFormats>[0];
type Edition = LibraryWork["editions"][number];

/** Cast partial test data to LibraryWork without using `unknown` */
function forceCast<T>(value: T | string | number | boolean | object | null): T {
  return value as T & typeof value;
}

function makeWork(
  title: string,
  authors: string[] = [],
  formats: string[] = [],
  enrichmentStatus: LibraryWork["enrichmentStatus"] = "ENRICHED",
): LibraryWork {
  return forceCast<LibraryWork>({
    id: `work-${title.toLowerCase().replace(/\s/g, "-")}`,
    titleDisplay: title,
    titleCanonical: title.toLowerCase(),
    sortTitle: title.toLowerCase(),
    coverPath: null,
    createdAt: new Date("2025-01-01"),
    enrichmentStatus,
    series: null,
    seriesPosition: null,
    editions: [
      {
        id: `edition-${title.toLowerCase().replace(/\s/g, "-")}`,
        formatFamily: formats[0] ?? "EBOOK",
        publisher: "Test Publisher" as string | null,
        isbn13: "1234567890123" as string | null,
        isbn10: null as string | null,
        contributors: authors.map((name) => ({
          role: "AUTHOR",
          contributor: { nameDisplay: name },
        })),
      },
    ],
  });
}

function makeEdition(overrides: Partial<Edition> & { id: string; formatFamily: string }): Edition {
  return forceCast<Edition>({
    publisher: null,
    isbn13: null,
    isbn10: null,
    contributors: [],
    ...overrides,
  });
}

describe("getFormats", () => {
  it("returns unique format families from editions", () => {
    const work = makeWork("Test", [], ["EBOOK"]);
    work.editions.push(makeEdition({ id: "e2", formatFamily: "AUDIOBOOK" }));
    expect(getFormats(work)).toEqual(["EBOOK", "AUDIOBOOK"]);
  });

  it("deduplicates format families", () => {
    const work = makeWork("Test", [], ["EBOOK"]);
    work.editions.push(makeEdition({ id: "e2", formatFamily: "EBOOK" }));
    expect(getFormats(work)).toEqual(["EBOOK"]);
  });

  it("returns empty array for work with no editions", () => {
    const work = makeWork("Test");
    work.editions = [];
    expect(getFormats(work)).toEqual([]);
  });
});

describe("COLUMN_PICKER_ITEMS", () => {
  it("has expected shape", () => {
    expect(COLUMN_PICKER_ITEMS).toEqual([
      { id: "authors", label: "Author(s)" },
      { id: "progress", label: "Progress" },
      { id: "formats", label: "Format" },
    ]);
  });
});

describe("getColumns", () => {
  const router = { invalidate: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function col(cols: ColumnDef<LibraryWork>[], index: number): ColumnDef<LibraryWork> {
    const c = cols[index];
    if (!c) throw new Error(`No column at index ${String(index)}`);
    return c;
  }

  it("returns 5 columns", () => {
    const cols = getColumns(false, false, router);
    expect(cols).toHaveLength(5);
  });

  it("first column is select with checkboxes", () => {
    const selectCol = col(getColumns(false, false, router), 0);
    expect(selectCol.id).toBe("select");
    expect(selectCol.enableSorting).toBe(false);
    expect(selectCol.enableHiding).toBe(false);
  });

  it("title column has correct accessor and config", () => {
    const titleCol = col(getColumns(false, false, router), 1);
    expect((titleCol as ColumnDef<LibraryWork> & { accessorKey?: string }).accessorKey).toBe("titleDisplay");
    expect(titleCol.enableHiding).toBe(false);
    expect(titleCol.size).toBe(300);
  });

  it("authors column has correct id and size", () => {
    const authorsCol = col(getColumns(false, false, router), 2);
    expect(authorsCol.id).toBe("authors");
    expect(authorsCol.size).toBe(200);
  });

  it("progress column has correct id, size, and sorting disabled", () => {
    const progressCol = col(getColumns(false, false, router), 3);
    expect(progressCol.id).toBe("progress");
    expect(progressCol.size).toBe(120);
    expect(progressCol.enableSorting).toBe(false);
  });

  it("formats column has correct id and size", () => {
    const formatsCol = col(getColumns(false, false, router), 4);
    expect(formatsCol.id).toBe("formats");
    expect(formatsCol.size).toBe(140);
  });

  it("progress column cell renders percentage when progressMap has entry", () => {
    const progressMap = { "work-test": 42 };
    const cols = getColumns(false, false, router, progressMap);
    const progressCol = col(cols, 3);
    const cellFn = progressCol.cell as (info: { row: { original: LibraryWork } }) => React.ReactNode;
    const work = makeWork("Test");
    const { container } = render(<>{cellFn({ row: { original: work } })}</>);
    expect(container.textContent).toContain("42%");
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("progress column cell renders dash when progressMap has no entry", () => {
    const cols = getColumns(false, false, router, {});
    const progressCol = col(cols, 3);
    const cellFn = progressCol.cell as (info: { row: { original: LibraryWork } }) => React.ReactNode;
    const work = makeWork("Test");
    const { container } = render(<>{cellFn({ row: { original: work } })}</>);
    expect(container.textContent).toContain("—");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("progress column cell renders dash when progressMap is undefined", () => {
    const cols = getColumns(false, false, router);
    const progressCol = col(cols, 3);
    const cellFn = progressCol.cell as (info: { row: { original: LibraryWork } }) => React.ReactNode;
    const work = makeWork("Test");
    const { container } = render(<>{cellFn({ row: { original: work } })}</>);
    expect(container.textContent).toContain("—");
  });
});
