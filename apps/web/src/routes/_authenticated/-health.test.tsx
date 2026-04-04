// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import type { MediaKind } from "@bookhouse/db";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  health: {
    totalWorks: number;
    checks: {
      missingCover: { count: number; total: number };
      noIsbn: { count: number; total: number };
      pendingDuplicates: { count: number };
      orphanedFiles: { count: number };
      pendingMatchSuggestions: { count: number };
      staleEnrichment: { count: number; total: number };
      emptyWorks: { count: number };
    };
  };
  orphanedFiles: { id: string; relativePath: string; mediaKind: MediaKind; sizeBytes: bigint | null }[];
  emptyWorks: { id: string; titleDisplay: string }[];
} = {
  health: {
    totalWorks: 100,
    checks: {
      missingCover: { count: 5, total: 100 },
      noIsbn: { count: 10, total: 100 },
      pendingDuplicates: { count: 3 },
      orphanedFiles: { count: 2 },
      pendingMatchSuggestions: { count: 4 },
      staleEnrichment: { count: 8, total: 100 },
      emptyWorks: { count: 2 },
    },
  },
  orphanedFiles: [
    { id: "f1", relativePath: "books/orphan1.epub", mediaKind: "EPUB" as MediaKind, sizeBytes: 1024n },
    { id: "f2", relativePath: "books/orphan2.epub", mediaKind: "EPUB" as MediaKind, sizeBytes: 2048n },
  ],
  emptyWorks: [
    { id: "w1", titleDisplay: "Ghost Book" },
    { id: "w2", titleDisplay: "Phantom Novel" },
  ],
};

const invalidateMock = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: invalidateMock, navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

vi.mock("~/lib/server-fns/library-health", () => ({
  getLibraryHealthServerFn: vi.fn(),
  getOrphanedFilesServerFn: vi.fn(),
  deleteOrphanedFileServerFn: vi.fn(),
  getEmptyWorksServerFn: vi.fn(),
  deleteEmptyWorksServerFn: vi.fn(),
}));

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
}));


import { Route } from "./health";
import {
  getLibraryHealthServerFn,
  getOrphanedFilesServerFn,
  deleteOrphanedFileServerFn,
  getEmptyWorksServerFn,
  deleteEmptyWorksServerFn,
} from "~/lib/server-fns/library-health";

const getHealthMock = vi.mocked(getLibraryHealthServerFn);
const getOrphanedMock = vi.mocked(getOrphanedFilesServerFn);
const deleteOrphanedMock = vi.mocked(deleteOrphanedFileServerFn);
const getEmptyWorksMock = vi.mocked(getEmptyWorksServerFn);
const deleteEmptyWorksMock = vi.mocked(deleteEmptyWorksServerFn);

beforeEach(() => {
  invalidateMock.mockReset();
  deleteOrphanedMock.mockReset();
  deleteEmptyWorksMock.mockReset();
});

const Page = (Route.options.component as React.ComponentType);

describe("health route", () => {
  it("loader calls both server functions in parallel and returns combined data", async () => {
    const mockHealth = { totalWorks: 50, checks: { missingCover: { count: 0, total: 50 }, noIsbn: { count: 0, total: 50 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 50 }, emptyWorks: { count: 0 } } };
    const mockOrphans = [{ id: "f1", relativePath: "a.epub", mediaKind: "EPUB" as const, sizeBytes: null }];
    const mockEmptyWorks = [{ id: "w1", titleDisplay: "Ghost" }];
    getHealthMock.mockResolvedValue(mockHealth);
    getOrphanedMock.mockResolvedValue(mockOrphans);
    getEmptyWorksMock.mockResolvedValue(mockEmptyWorks);

    const result = await (Route.options.loader as () => Promise<object>)();
    expect(getHealthMock).toHaveBeenCalled();
    expect(getOrphanedMock).toHaveBeenCalled();
    expect(getEmptyWorksMock).toHaveBeenCalled();
    expect(result).toEqual({ health: mockHealth, orphanedFiles: mockOrphans, emptyWorks: mockEmptyWorks });
  });

  describe("HealthPage component", () => {
    it("renders Library Health heading", () => {
      render(<Page />);
      expect(screen.getByText("Library Health")).toBeTruthy();
    });

    it("renders an experimental disclaimer banner", () => {
      render(<Page />);
      expect(screen.getByText(/experimental/i)).toBeTruthy();
    });

    it("renders all 7 health check category labels", () => {
      render(<Page />);
      expect(screen.getByText("Missing Covers")).toBeTruthy();
      expect(screen.getByText("Missing ISBN")).toBeTruthy();
      expect(screen.getByText("Pending Duplicates")).toBeTruthy();
      expect(screen.getByText("Orphaned Files")).toBeTruthy();
      expect(screen.getByText("Pending Matches")).toBeTruthy();
      expect(screen.getByText("Stale Enrichment")).toBeTruthy();
      expect(screen.getByText("Empty Works")).toBeTruthy();
    });

    it("renders a health score percentage", () => {
      render(<Page />);
      expect(screen.getByTestId("health-score")).toBeTruthy();
    });

    // ── Missing Covers / ISBN — informational only ──────────────────────────

    it("does NOT render a Review link for Missing Covers", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 5, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      // Only actionable links (/duplicates, /match-suggestions) should exist — not missing-covers filter
      const links = screen.queryAllByRole("link");
      const hrefs = links.map((l) => l.getAttribute("href"));
      expect(hrefs.some((h) => h?.includes("hasCover"))).toBe(false);
    });

    it("does NOT render a Review link for Missing ISBN", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 10, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      const links = screen.queryAllByRole("link");
      const hrefs = links.map((l) => l.getAttribute("href"));
      expect(hrefs.some((h) => h?.includes("hasIsbn"))).toBe(false);
    });

    // ── Pending Duplicates / Match Suggestions — link to dedicated pages ────

    it("renders a link to /duplicates when there are pending duplicates", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 3 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      const links = screen.getAllByRole("link");
      expect(links.some((l) => l.getAttribute("href") === "/duplicates")).toBe(true);
    });

    it("renders a link to /match-suggestions when there are pending matches", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 4 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      const links = screen.getAllByRole("link");
      expect(links.some((l) => l.getAttribute("href") === "/match-suggestions")).toBe(true);
    });

    // ── Orphaned Files — inline list with delete ────────────────────────────

    it("renders orphaned file paths in the list", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 2 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [
          { id: "f1", relativePath: "books/orphan1.epub", mediaKind: "EPUB" as MediaKind, sizeBytes: 1024n },
          { id: "f2", relativePath: "books/orphan2.epub", mediaKind: "EPUB" as MediaKind, sizeBytes: 2048n },
        ],
        emptyWorks: [],
      };
      render(<Page />);
      expect(screen.getByText("books/orphan1.epub")).toBeTruthy();
      expect(screen.getByText("books/orphan2.epub")).toBeTruthy();
    });

    it("calls deleteOrphanedFileServerFn and invalidates on delete click", async () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 1 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [
          { id: "f1", relativePath: "books/orphan1.epub", mediaKind: "EPUB" as MediaKind, sizeBytes: null },
        ],
        emptyWorks: [],
      };
      deleteOrphanedMock.mockResolvedValue({ success: true });
      render(<Page />);

      const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
      await userEvent.click(deleteButtons[0] as HTMLElement);

      await waitFor(() => {
        expect(deleteOrphanedMock).toHaveBeenCalledWith({ data: { fileAssetId: "f1" } });
        expect(invalidateMock).toHaveBeenCalled();
      });
    });

    it("shows no orphaned files message when list is empty", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      expect(screen.getByText(/no orphaned files/i)).toBeTruthy();
    });

    // ── Empty Works — inline list with delete all ────────────────────────────

    it("renders empty works titles in the list", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 2 } } },
        orphanedFiles: [],
        emptyWorks: [
          { id: "w1", titleDisplay: "Ghost Book" },
          { id: "w2", titleDisplay: "Phantom Novel" },
        ],
      };
      render(<Page />);
      expect(screen.getByText("Ghost Book")).toBeTruthy();
      expect(screen.getByText("Phantom Novel")).toBeTruthy();
    });

    it("calls deleteEmptyWorksServerFn and invalidates on delete all click", async () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 1 } } },
        orphanedFiles: [],
        emptyWorks: [{ id: "w1", titleDisplay: "Ghost Book" }],
      };
      deleteEmptyWorksMock.mockResolvedValue({ deletedCount: 1 });
      render(<Page />);

      const deleteBtn = screen.getByTestId("delete-empty-works-btn");
      await userEvent.click(deleteBtn);

      await waitFor(() => {
        expect(deleteEmptyWorksMock).toHaveBeenCalled();
        expect(invalidateMock).toHaveBeenCalled();
      });
    });

    it("shows no empty works message when list is empty", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      expect(screen.getByText(/no empty works/i)).toBeTruthy();
    });

    // ── Empty state ─────────────────────────────────────────────────────────

    it("shows empty state when library has no works", () => {
      mockLoaderData = {
        health: { totalWorks: 0, checks: { missingCover: { count: 0, total: 0 }, noIsbn: { count: 0, total: 0 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 0 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      expect(screen.getByText(/no works/i)).toBeTruthy();
    });

    it("shows singular 'issue' when exactly 1 issue found", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 1, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      expect(screen.getByText(/1 issue found/)).toBeTruthy();
    });

    it("does not render review links for zero-count categories", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 1 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      const reviewLinks = screen.getAllByText("Review");
      expect(reviewLinks).toHaveLength(1);
    });

    it("calculates health score and renders it in data-testid element", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 10, total: 100 }, noIsbn: { count: 20, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 5 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 0 } } },
        orphanedFiles: [],
        emptyWorks: [],
      };
      render(<Page />);
      const scoreEl = screen.getByTestId("health-score");
      expect(scoreEl.textContent).toMatch(/\d+%/);
    });

    it("shows singular label when 1 empty work", () => {
      mockLoaderData = {
        health: { totalWorks: 100, checks: { missingCover: { count: 0, total: 100 }, noIsbn: { count: 0, total: 100 }, pendingDuplicates: { count: 0 }, orphanedFiles: { count: 0 }, pendingMatchSuggestions: { count: 0 }, staleEnrichment: { count: 0, total: 100 }, emptyWorks: { count: 1 } } },
        orphanedFiles: [],
        emptyWorks: [{ id: "w1", titleDisplay: "Ghost Book" }],
      };
      render(<Page />);
      expect(screen.getByTestId("delete-empty-works-btn").textContent).toContain("1 empty work");
    });
  });
});
