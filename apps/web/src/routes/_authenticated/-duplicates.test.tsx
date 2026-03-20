// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";

const invalidateMock = vi.fn();

let mockLoaderData: {
  duplicates: {
    id: string;
    leftEditionId: string | null;
    rightEditionId: string | null;
    leftEdition: { work?: { titleDisplay: string; coverPath?: string | null }; contributors?: { contributor: { nameDisplay: string } }[] } | null;
    rightEdition: { work?: { titleDisplay: string; coverPath?: string | null }; contributors?: { contributor: { nameDisplay: string } }[] } | null;
    leftFileAsset: { basename: string; relativePath?: string } | null;
    rightFileAsset: { basename: string; relativePath?: string } | null;
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
});
