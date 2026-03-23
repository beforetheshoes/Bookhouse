// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";

const invalidateMock = vi.fn();

interface MockEditionFile {
  fileAsset: {
    relativePath: string;
    sizeBytes: bigint | null;
    mediaKind: string;
    extension: string | null;
    fullHash: string | null;
  };
}

interface MockEdition {
  work?: { id?: string; titleDisplay: string; coverPath?: string | null };
  contributors?: { contributor: { nameDisplay: string } }[];
  editionFiles?: MockEditionFile[];
  isbn13?: string | null;
  isbn10?: string | null;
  publisher?: string | null;
  publishedAt?: string | null;
  formatFamily?: string;
}

interface MockFileAsset {
  basename: string;
  relativePath?: string;
  sizeBytes?: bigint | null;
  mediaKind?: string;
  extension?: string | null;
  fullHash?: string | null;
}

let mockLoaderData: {
  duplicates: {
    id: string;
    leftEditionId: string | null;
    rightEditionId: string | null;
    leftEdition: MockEdition | null;
    rightEdition: MockEdition | null;
    leftFileAsset: MockFileAsset | null;
    rightFileAsset: MockFileAsset | null;
    reason: string;
    confidence: number | null;
    status: string;
  }[];
} = { duplicates: [] };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: unknown }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: invalidateMock, navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const getDuplicatesServerFnMock = vi.fn();
const ignoreDuplicateServerFnMock = vi.fn();
const confirmDuplicateServerFnMock = vi.fn();
const mergeDuplicateServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/duplicates", () => ({
  getDuplicatesServerFn: getDuplicatesServerFnMock,
  ignoreDuplicateServerFn: ignoreDuplicateServerFnMock,
  confirmDuplicateServerFn: confirmDuplicateServerFnMock,
  mergeDuplicateServerFn: mergeDuplicateServerFnMock,
}));

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const makeDuplicate = (overrides: Partial<typeof mockLoaderData.duplicates[number]> = {}) => ({
  id: "dup-1",
  leftEditionId: "ed-1",
  rightEditionId: "ed-2",
  leftEdition: null,
  rightEdition: null,
  leftFileAsset: null,
  rightFileAsset: null,
  reason: "SAME_ISBN",
  confidence: null,
  status: "PENDING",
  ...overrides,
});

describe("formatFileSize", () => {
  it("returns dash for null", async () => {
    const { formatFileSize } = await import("./duplicates");
    expect(formatFileSize(null)).toBe("—");
  });
});

describe("DuplicatesPage", () => {
  beforeEach(() => {
    mockLoaderData = { duplicates: [] };
    vi.clearAllMocks();
  });

  it("loader calls getDuplicatesServerFn", async () => {
    getDuplicatesServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./duplicates");
    const result = await (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({});
    expect(getDuplicatesServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ duplicates: [] });
  });

  it("renders 'Duplicates' heading", async () => {
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("Duplicates")).toBeTruthy();
  });

  it("renders tab buttons for each status", async () => {
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(screen.getByText("Ignored")).toBeTruthy();
    expect(screen.getByText("Merged")).toBeTruthy();
  });

  it("renders side-by-side cards with titles and authors", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftEdition: {
            work: { titleDisplay: "The Hobbit" },
            contributors: [{ contributor: { nameDisplay: "J.R.R. Tolkien" } }],
          },
          rightEdition: {
            work: { titleDisplay: "The Hobbit (Deluxe)" },
            contributors: [{ contributor: { nameDisplay: "J.R.R. Tolkien" } }],
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("The Hobbit")).toBeTruthy();
    expect(screen.getByText("The Hobbit (Deluxe)")).toBeTruthy();
    expect(screen.getAllByText("J.R.R. Tolkien").length).toBeGreaterThanOrEqual(2);
  });

  it("renders file path when no edition", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftFileAsset: { basename: "book.epub", relativePath: "/books/book.epub" },
          rightFileAsset: { basename: "copy.epub", relativePath: "/books/copy.epub" },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("book.epub")).toBeTruthy();
    expect(screen.getByText("copy.epub")).toBeTruthy();
  });

  it("renders confidence as percentage", async () => {
    mockLoaderData = {
      duplicates: [makeDuplicate({ confidence: 0.92 })],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("92%")).toBeTruthy();
  });

  it("renders reason badge", async () => {
    mockLoaderData = {
      duplicates: [makeDuplicate({ reason: "SAME_HASH" })],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("SAME_HASH")).toBeTruthy();
  });

  it("renders empty state when no duplicates", async () => {
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("No duplicates found")).toBeTruthy();
  });

  it("ignore button calls ignoreDuplicateServerFn", async () => {
    ignoreDuplicateServerFnMock.mockResolvedValue({ success: true });
    mockLoaderData = {
      duplicates: [makeDuplicate({ status: "PENDING" })],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    const ignoreBtn = screen.getByRole("button", { name: "Ignore" });
    fireEvent.click(ignoreBtn);
    await waitFor(() => {
      expect(ignoreDuplicateServerFnMock).toHaveBeenCalledWith({
        data: { id: "dup-1" },
      });
    });
  });

  it("confirm button calls confirmDuplicateServerFn", async () => {
    confirmDuplicateServerFnMock.mockResolvedValue({ success: true });
    mockLoaderData = {
      duplicates: [makeDuplicate({ status: "PENDING" })],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(confirmDuplicateServerFnMock).toHaveBeenCalledWith({
        data: { id: "dup-1" },
      });
    });
  });

  it("merge-left button calls mergeDuplicateServerFn with left edition", async () => {
    mergeDuplicateServerFnMock.mockResolvedValue({ success: true });
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          status: "PENDING",
          leftEditionId: "ed-1",
          rightEditionId: "ed-2",
          leftEdition: { work: { titleDisplay: "Book A" } },
          rightEdition: { work: { titleDisplay: "Book B" } },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    const mergeLeftBtn = screen.getByRole("button", { name: /Keep Left/i });
    fireEvent.click(mergeLeftBtn);
    await waitFor(() => {
      expect(mergeDuplicateServerFnMock).toHaveBeenCalledWith({
        data: { id: "dup-1", survivingEditionId: "ed-1" },
      });
    });
  });

  it("merge-right button calls mergeDuplicateServerFn with right edition", async () => {
    mergeDuplicateServerFnMock.mockResolvedValue({ success: true });
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          status: "PENDING",
          leftEditionId: "ed-1",
          rightEditionId: "ed-2",
          leftEdition: { work: { titleDisplay: "Book A" } },
          rightEdition: { work: { titleDisplay: "Book B" } },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    const mergeRightBtn = screen.getByRole("button", { name: /Keep Right/i });
    fireEvent.click(mergeRightBtn);
    await waitFor(() => {
      expect(mergeDuplicateServerFnMock).toHaveBeenCalledWith({
        data: { id: "dup-1", survivingEditionId: "ed-2" },
      });
    });
  });

  it("does not render merge buttons when both edition IDs are null", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          status: "PENDING",
          leftEditionId: null,
          rightEditionId: null,
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.queryByRole("button", { name: /Keep Left/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Keep Right/i })).toBeNull();
  });

  it("does not render ignore/confirm buttons for non-PENDING status", async () => {
    mockLoaderData = {
      duplicates: [makeDuplicate({ status: "MERGED" })],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.queryByRole("button", { name: "Ignore" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("renders unknown status with fallback outline variant", async () => {
    mockLoaderData = {
      duplicates: [makeDuplicate({ status: "UNKNOWN_STATUS" })],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    const badge = screen.getByText("UNKNOWN_STATUS");
    expect(badge.getAttribute("data-variant")).toBe("outline");
  });

  it("filters duplicates by tab", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({ id: "dup-1", status: "PENDING", leftEdition: { work: { titleDisplay: "Pending Book" } } }),
        makeDuplicate({ id: "dup-2", status: "MERGED", leftEdition: { work: { titleDisplay: "Merged Book" } } }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    const user = userEvent.setup();

    // "All" tab shows both
    expect(screen.getByText("Pending Book")).toBeTruthy();
    expect(screen.getByText("Merged Book")).toBeTruthy();

    // Click "Pending" tab
    await user.click(screen.getByRole("tab", { name: "Pending" }));
    expect(screen.getByText("Pending Book")).toBeTruthy();
    expect(screen.queryByText("Merged Book")).toBeNull();

    // Click "Merged" tab
    await user.click(screen.getByRole("tab", { name: "Merged" }));
    expect(screen.queryByText("Pending Book")).toBeNull();
    expect(screen.getByText("Merged Book")).toBeTruthy();
  });

  it("shows '—' for null confidence", async () => {
    mockLoaderData = {
      duplicates: [makeDuplicate({
        confidence: null,
        leftEdition: { work: { titleDisplay: "Has Title" } },
        rightEdition: { work: { titleDisplay: "Has Title Too" } },
      })],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    // Only the confidence should be a dash (sides have titles)
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(1);
  });

  it("renders dash when neither edition nor file", async () => {
    mockLoaderData = {
      duplicates: [makeDuplicate()],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    // Two side dashes + one confidence dash = 3
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(3);
  });

  it("renders file path from direct fileAsset", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftFileAsset: {
            basename: "book.epub",
            relativePath: "Author/Title/book.epub",
            sizeBytes: 1048576n,
            mediaKind: "EPUB",
            extension: "epub",
            fullHash: "abc123def456",
          },
          rightFileAsset: {
            basename: "book-copy.epub",
            relativePath: "Author/Title/book-copy.epub",
            sizeBytes: 2097152n,
            mediaKind: "EPUB",
            extension: "epub",
            fullHash: "abc123def456",
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("Author/Title/book.epub")).toBeTruthy();
    expect(screen.getByText("Author/Title/book-copy.epub")).toBeTruthy();
  });

  it("renders file path from edition's editionFiles when no direct fileAsset", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftEdition: {
            work: { titleDisplay: "Test Book" },
            contributors: [],
            editionFiles: [{
              fileAsset: {
                relativePath: "Author/Test Book/test.epub",
                sizeBytes: 500000n,
                mediaKind: "EPUB",
                extension: "epub",
                fullHash: null,
              },
            }],
          },
          rightEdition: {
            work: { titleDisplay: "Test Book" },
            contributors: [],
            editionFiles: [{
              fileAsset: {
                relativePath: "Author/Test Book/test2.epub",
                sizeBytes: 600000n,
                mediaKind: "EPUB",
                extension: "epub",
                fullHash: null,
              },
            }],
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("Author/Test Book/test.epub")).toBeTruthy();
    expect(screen.getByText("Author/Test Book/test2.epub")).toBeTruthy();
  });

  it("renders formatted file size", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftFileAsset: {
            basename: "book.epub",
            relativePath: "book.epub",
            sizeBytes: 1572864n,
            mediaKind: "EPUB",
            extension: "epub",
            fullHash: null,
          },
          rightFileAsset: {
            basename: "book2.epub",
            relativePath: "book2.epub",
            sizeBytes: 500n,
            mediaKind: "EPUB",
            extension: "epub",
            fullHash: null,
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("1.5 MB")).toBeTruthy();
    expect(screen.getByText("500 B")).toBeTruthy();
  });

  it("renders format from mediaKind", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftFileAsset: {
            basename: "book.epub",
            relativePath: "book.epub",
            sizeBytes: 1000n,
            mediaKind: "EPUB",
            extension: "epub",
            fullHash: null,
          },
          rightFileAsset: {
            basename: "book.pdf",
            relativePath: "book.pdf",
            sizeBytes: 2000n,
            mediaKind: "PDF",
            extension: "pdf",
            fullHash: null,
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("EPUB")).toBeTruthy();
    expect(screen.getByText("PDF")).toBeTruthy();
  });

  it("renders ISBN10 when ISBN13 is not available for SAME_ISBN reason", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          reason: "SAME_ISBN",
          leftEdition: {
            work: { titleDisplay: "Book A" },
            contributors: [],
            isbn13: null,
            isbn10: "0316499015",
            editionFiles: [],
          },
          rightEdition: {
            work: { titleDisplay: "Book B" },
            contributors: [],
            isbn13: null,
            isbn10: "0316499015",
            editionFiles: [],
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getAllByText("0316499015").length).toBeGreaterThanOrEqual(1);
  });

  it("renders no file size when sizeBytes is null", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftFileAsset: {
            basename: "book.epub",
            relativePath: "Author/Title/book.epub",
            sizeBytes: null,
            mediaKind: "EPUB",
            extension: "epub",
            fullHash: null,
          },
          rightFileAsset: null,
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("EPUB")).toBeTruthy();
    expect(screen.getByText("Author/Title/book.epub")).toBeTruthy();
  });

  it("renders ISBN for SAME_ISBN reason", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          reason: "SAME_ISBN",
          leftEdition: {
            work: { titleDisplay: "Book A" },
            contributors: [],
            isbn13: "9780316498834",
            editionFiles: [],
          },
          rightEdition: {
            work: { titleDisplay: "Book B" },
            contributors: [],
            isbn13: "9780316498834",
            editionFiles: [],
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getAllByText("9780316498834").length).toBeGreaterThanOrEqual(1);
  });

  it("renders truncated hash for SAME_HASH reason", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          reason: "SAME_HASH",
          leftFileAsset: {
            basename: "book.epub",
            relativePath: "book.epub",
            sizeBytes: 1000n,
            mediaKind: "EPUB",
            extension: "epub",
            fullHash: "abc123def456789ghijk",
          },
          rightFileAsset: {
            basename: "copy.epub",
            relativePath: "copy.epub",
            sizeBytes: 1000n,
            mediaKind: "EPUB",
            extension: "epub",
            fullHash: "abc123def456789ghijk",
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    // Should show a truncated hash
    expect(screen.getAllByText(/abc123/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders publisher and date when available", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftEdition: {
            work: { titleDisplay: "Book A" },
            contributors: [],
            publisher: "Penguin",
            publishedAt: "2023-06-15T00:00:00.000Z",
            editionFiles: [],
          },
          rightEdition: {
            work: { titleDisplay: "Book B" },
            contributors: [],
            publisher: "Random House",
            publishedAt: null,
            editionFiles: [],
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText(/Penguin/)).toBeTruthy();
    expect(screen.getByText(/Random House/)).toBeTruthy();
  });

  it("renders file size in GB for large files", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftFileAsset: {
            basename: "huge.epub",
            relativePath: "huge.epub",
            sizeBytes: 2147483648n, // 2 GB
            mediaKind: "EPUB",
            extension: "epub",
            fullHash: null,
          },
          rightFileAsset: null,
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    expect(screen.getByText("2.0 GB")).toBeTruthy();
  });

  it("renders cover thumbnail when coverPath is available", async () => {
    mockLoaderData = {
      duplicates: [
        makeDuplicate({
          leftEdition: {
            work: { id: "work-abc", titleDisplay: "Book A", coverPath: "/covers/abc.jpg" },
            contributors: [],
            editionFiles: [],
          },
          rightEdition: {
            work: { titleDisplay: "Book B" },
            contributors: [],
            editionFiles: [],
          },
        }),
      ],
    };
    const { Route } = await import("./duplicates");
    const DuplicatesPage = (Route.options.component as React.ComponentType);
    render(<DuplicatesPage />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("/api/covers/work-abc/thumb");
  });
});
