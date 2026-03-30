// @vitest-environment happy-dom
import type * as DataTableModule from "~/components/data-table";
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: { shelves: { id: string; name: string; kind: string; formatFilter: string; _count: { items: number } }[] } = { shelves: [] };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const getShelvesServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/shelves", () => ({
  getShelvesServerFn: getShelvesServerFnMock,
  createShelfServerFn: vi.fn(),
  renameShelfServerFn: vi.fn(),
  deleteShelfServerFn: vi.fn(),
}));

vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof DataTableModule>("~/components/data-table");
  return actual;
});

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
}));

vi.mock("~/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) => {
    if (open) {
      return <div data-testid="dialog">{children}</div>;
    }
    return null;
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: () => void; className?: string; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

let selectOnValueChangeCapture: ((v: string) => void) | null = null;

vi.mock("~/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (v: string) => void }) => {
    selectOnValueChangeCapture = onValueChange;
    return <div data-testid="format-select" data-value={value}>{children}</div>;
  },
  SelectTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: string | undefined | React.ReactNode }) => <div {...props}>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button data-testid={`select-option-${value}`} onClick={() => { selectOnValueChangeCapture?.(value); }}>{children}</button>
  ),
  SelectValue: () => <span>ALL</span>,
}));

describe("ShelvesPage", () => {
  beforeEach(() => {
    mockLoaderData = { shelves: [] };
    vi.clearAllMocks();
  });

  it("loader calls getShelvesServerFn", async () => {
    getShelvesServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./shelves.index");
    const result = await (Route.options.loader as (args: Record<string, string | object>) => Promise<object>)({});
    expect(getShelvesServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ shelves: [] });
  });

  it("renders 'Shelves' heading", async () => {
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    expect(screen.getByText("Shelves")).toBeTruthy();
  });

  it("renders shelf data in table with links", async () => {
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Fantasy", kind: "MANUAL", formatFilter: "ALL", _count: { items: 5 } },
        { id: "s2", name: "Sci-Fi", kind: "MANUAL", formatFilter: "EBOOK", _count: { items: 3 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    expect(screen.getByText("Fantasy")).toBeTruthy();
    expect(screen.getByText("Sci-Fi")).toBeTruthy();
  });

  it("renders shelf names as links", async () => {
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Fantasy", kind: "MANUAL", formatFilter: "ALL", _count: { items: 5 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    const link = screen.getByText("Fantasy").closest("a");
    expect(link).toBeTruthy();
  });

  it("renders filter input", async () => {
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    expect(screen.getByPlaceholderText("Filter by name...")).toBeTruthy();
  });

  it("shows 'No results.' when shelves is empty", async () => {
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    expect(screen.getByText("No results.")).toBeTruthy();
  });

  it("renders Create Shelf button", async () => {
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    expect(screen.getByTestId("create-shelf-btn")).toBeTruthy();
  });

  it("opens create dialog when clicking Create Shelf button", async () => {
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    fireEvent.click(screen.getByTestId("create-shelf-btn"));
    expect(screen.getByTestId("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Create Shelf" })).toBeTruthy();
    expect(screen.getByTestId("create-shelf-name")).toBeTruthy();
    expect(screen.getByTestId("create-shelf-format")).toBeTruthy();
  });

  it("calls createShelfServerFn with default format filter when submitting create dialog", async () => {
    const { createShelfServerFn } = await import("~/lib/server-fns/shelves");
    vi.mocked(createShelfServerFn).mockResolvedValue({} as never);
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    fireEvent.click(screen.getByTestId("create-shelf-btn"));
    fireEvent.change(screen.getByTestId("create-shelf-name"), {
      target: { value: "My New Shelf" },
    });
    fireEvent.click(screen.getByTestId("create-shelf-submit"));
    await waitFor(() => {
      expect(vi.mocked(createShelfServerFn)).toHaveBeenCalledWith({
        data: { name: "My New Shelf", formatFilter: "ALL" },
      });
    });
  });

  it("calls createShelfServerFn with selected format filter", async () => {
    const { createShelfServerFn } = await import("~/lib/server-fns/shelves");
    vi.mocked(createShelfServerFn).mockResolvedValue({} as never);
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    fireEvent.click(screen.getByTestId("create-shelf-btn"));
    fireEvent.change(screen.getByTestId("create-shelf-name"), {
      target: { value: "Ebook Shelf" },
    });
    fireEvent.click(screen.getByTestId("select-option-EBOOK"));
    fireEvent.click(screen.getByTestId("create-shelf-submit"));
    await waitFor(() => {
      expect(vi.mocked(createShelfServerFn)).toHaveBeenCalledWith({
        data: { name: "Ebook Shelf", formatFilter: "EBOOK" },
      });
    });
  });

  it("renders format badge in table", async () => {
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Fantasy", kind: "MANUAL", formatFilter: "EBOOK", _count: { items: 5 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    expect(screen.getByText("Ebooks")).toBeTruthy();
  });

  it("renders Editions column header", async () => {
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Fantasy", kind: "MANUAL", formatFilter: "ALL", _count: { items: 5 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    expect(screen.getByText("Editions")).toBeTruthy();
  });

  it("opens rename dialog from actions menu", async () => {
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Fantasy", kind: "MANUAL", formatFilter: "ALL", _count: { items: 5 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    fireEvent.click(screen.getByTestId("actions-s1"));
    fireEvent.click(screen.getByText("Rename"));
    expect(screen.getByText("Rename Shelf")).toBeTruthy();
    expect(screen.getByTestId("rename-shelf-name")).toBeTruthy();
  });

  it("opens delete dialog from actions menu", async () => {
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Fantasy", kind: "MANUAL", formatFilter: "ALL", _count: { items: 5 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    fireEvent.click(screen.getByTestId("actions-s1"));
    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Delete Shelf")).toBeTruthy();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeTruthy();
  });

  it("calls deleteShelfServerFn when confirming delete", async () => {
    const { deleteShelfServerFn } = await import("~/lib/server-fns/shelves");
    vi.mocked(deleteShelfServerFn).mockResolvedValue({} as never);
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Fantasy", kind: "MANUAL", formatFilter: "ALL", _count: { items: 5 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    fireEvent.click(screen.getByTestId("actions-s1"));
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByTestId("delete-shelf-confirm"));
    await waitFor(() => {
      expect(vi.mocked(deleteShelfServerFn)).toHaveBeenCalledWith({
        data: { shelfId: "s1" },
      });
    });
  });

  it("calls renameShelfServerFn when submitting rename dialog", async () => {
    const { renameShelfServerFn } = await import("~/lib/server-fns/shelves");
    vi.mocked(renameShelfServerFn).mockResolvedValue({} as never);
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Fantasy", kind: "MANUAL", formatFilter: "ALL", _count: { items: 5 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    fireEvent.click(screen.getByTestId("actions-s1"));
    fireEvent.click(screen.getByText("Rename"));
    fireEvent.change(screen.getByTestId("rename-shelf-name"), {
      target: { value: "Sci-Fi" },
    });
    fireEvent.click(screen.getByTestId("rename-shelf-submit"));
    await waitFor(() => {
      expect(vi.mocked(renameShelfServerFn)).toHaveBeenCalledWith({
        data: { shelfId: "s1", name: "Sci-Fi" },
      });
    });
  });

  it("renders raw formatFilter when not in FORMAT_LABELS", async () => {
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Custom", kind: "MANUAL", formatFilter: "UNKNOWN_FORMAT", _count: { items: 1 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    expect(screen.getByText("UNKNOWN_FORMAT")).toBeTruthy();
  });

  it("renders cancel button in delete dialog", async () => {
    mockLoaderData = {
      shelves: [
        { id: "s1", name: "Fantasy", kind: "MANUAL", formatFilter: "ALL", _count: { items: 5 } },
      ],
    };
    const { Route } = await import("./shelves.index");
    const ShelvesPage = (Route.options.component as React.ComponentType);
    render(<ShelvesPage />);
    fireEvent.click(screen.getByTestId("actions-s1"));
    fireEvent.click(screen.getByText("Delete"));
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn);
  });
});
