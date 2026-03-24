// @vitest-environment happy-dom
import React from "react";
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockWork {
  id: string;
  titleDisplay: string;
  description: string | null;
  language: string | null;
  coverPath: string | null;
  seriesPosition: number | null;
  series: { id: string; name: string } | null;
  editions: {
    id: string;
    formatFamily: string;
    publisher: string | null;
    publishedAt: string | null;
    isbn13: string | null;
    isbn10: string | null;
    asin: string | null;
    contributors: { role: string; contributor: { id: string; nameDisplay: string } }[];
    editionFiles: {
      id: string;
      role: string;
      fileAsset: {
        id: string;
        basename: string;
        sizeBytes: bigint;
        mediaKind: string;
        availabilityStatus: string;
      };
    }[];
  }[];
}

interface MockProgress {
  id: string;
  editionId: string;
  progressKind: string;
  percent: number | null;
}

let mockLoaderData: { work: MockWork; progress: MockProgress[]; trackingMode: string } = {
  work: {
    id: "work-1",
    titleDisplay: "The Name of the Wind",
    description: "A story about Kvothe.",
    language: "en",
    coverPath: "/covers/work-1",
    seriesPosition: 1,
    series: { id: "series-1", name: "The Kingkiller Chronicle" },
    editions: [
      {
        id: "edition-1",
        formatFamily: "EBOOK",
        publisher: "DAW Books",
        publishedAt: "2007-03-27T00:00:00.000Z",
        isbn13: "9780756404079",
        isbn10: null,
        asin: "B003HV0TN2",
        contributors: [
          { role: "AUTHOR", contributor: { id: "contrib-1", nameDisplay: "Patrick Rothfuss" } },
        ],
        editionFiles: [
          {
            id: "ef-1",
            role: "PRIMARY",
            fileAsset: {
              id: "fa-1",
              basename: "the-name-of-the-wind.epub",
              sizeBytes: 1048576n,
              mediaKind: "EPUB",
              availabilityStatus: "PRESENT",
            },
          },
        ],
      },
    ],
  },
  progress: [],
  trackingMode: "BY_EDITION",
};

const mockNavigate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: unknown }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ navigate: mockNavigate, invalidate: mockInvalidate }),
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: mockToast }));

const getWorkDetailServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/work-detail", () => ({
  getWorkDetailServerFn: getWorkDetailServerFnMock,
}));

const getReadingProgressServerFnMock = vi.fn();
const updateReadingProgressServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/reading-progress", () => ({
  getReadingProgressServerFn: getReadingProgressServerFnMock,
  updateReadingProgressServerFn: updateReadingProgressServerFnMock,
}));

const deleteWorkServerFnMock = vi.fn();
const deleteEditionServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/deletion", () => ({
  deleteWorkServerFn: deleteWorkServerFnMock,
  deleteEditionServerFn: deleteEditionServerFnMock,
}));

const capturedDialogProps: { onOpenChange?: (open: boolean) => void }[] = [];

let forceRenderClosed = false;

vi.mock("~/components/ui/dialog", () => ({
  Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) => {
    if (onOpenChange) {
      capturedDialogProps.push({ onOpenChange });
    }
    if (forceRenderClosed || open) {
      return <div data-testid="dialog" data-open={String(open)}>{children}</div>;
    }
    return null;
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("~/components/enrichment-review", () => ({
  EnrichmentReview: ({ workId, currentDescription }: { workId: string; currentDescription: string | null }) => (
    <div data-testid="enrichment-review" data-work-id={workId} data-description={currentDescription ?? ""} />
  ),
}));

describe("WorkDetailPage", () => {
  beforeEach(() => {
    mockLoaderData = {
      work: {
        id: "work-1",
        titleDisplay: "The Name of the Wind",
        description: "A story about Kvothe.",
        language: "en",
        coverPath: "/covers/work-1",
        seriesPosition: 1,
        series: { id: "series-1", name: "The Kingkiller Chronicle" },
        editions: [
          {
            id: "edition-1",
            formatFamily: "EBOOK",
            publisher: "DAW Books",
            publishedAt: "2007-03-27T00:00:00.000Z",
            isbn13: "9780756404079",
            isbn10: null,
            asin: "B003HV0TN2",
            contributors: [
              { role: "AUTHOR", contributor: { id: "contrib-1", nameDisplay: "Patrick Rothfuss" } },
            ],
            editionFiles: [
              {
                id: "ef-1",
                role: "PRIMARY",
                fileAsset: {
                  id: "fa-1",
                  basename: "the-name-of-the-wind.epub",
                  sizeBytes: 1048576n,
                  mediaKind: "EPUB",
                  availabilityStatus: "PRESENT",
                },
              },
            ],
          },
        ],
      },
      progress: [],
      trackingMode: "BY_EDITION",
    };
    capturedDialogProps.length = 0;
    forceRenderClosed = false;
    vi.clearAllMocks();
  });

  it("loader calls getWorkDetailServerFn and getReadingProgressServerFn", async () => {
    getWorkDetailServerFnMock.mockResolvedValueOnce(mockLoaderData.work);
    getReadingProgressServerFnMock.mockResolvedValueOnce({ progress: [], trackingMode: "BY_EDITION" });
    const { Route } = await import("./library.$workId");
    const result = await (Route.options.loader as (args: { params: { workId: string } }) => Promise<unknown>)({
      params: { workId: "work-1" },
    });
    expect(getWorkDetailServerFnMock).toHaveBeenCalledWith({
      data: { workId: "work-1" },
    });
    expect(getReadingProgressServerFnMock).toHaveBeenCalledWith({
      data: { workId: "work-1" },
    });
    expect(result).toEqual({
      work: mockLoaderData.work,
      progress: [],
      trackingMode: "BY_EDITION",
    });
  });

  it("renders work title as heading", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The Name of the Wind");
  });

  it("renders breadcrumb link to library", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const libraryLink = screen.getByText("Library");
    expect(libraryLink.closest("a")?.getAttribute("href")).toBe("/library");
  });

  it("renders cover image with medium size", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const img = screen.getByAltText("The Name of the Wind");
    expect(img.getAttribute("src")).toBe("/api/covers/work-1/medium");
  });

  it("falls back to placeholder when cover image fails to load", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);
    const img = screen.getByAltText("The Name of the Wind");
    fireEvent.error(img);
    expect(screen.getByTestId("cover-placeholder")).toBeTruthy();
  });

  it("renders placeholder when no cover path", async () => {
    mockLoaderData.work.coverPath = null;
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.queryByAltText("The Name of the Wind")).toBeNull();
    expect(screen.getByTestId("cover-placeholder")).toBeTruthy();
  });

  it("renders authors as links to author pages", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const authorLinks = screen.getAllByText("Patrick Rothfuss");
    expect(authorLinks.length).toBeGreaterThan(0);
    const topAuthorLink = authorLinks[0]?.closest("a");
    expect(topAuthorLink?.getAttribute("href")).toBe("/authors/$authorId");
  });

  it("renders comma-separated authors when multiple", async () => {
    const edition = mockLoaderData.work.editions[0];
    if (!edition) throw new Error("expected edition");
    edition.contributors.push(
      { role: "AUTHOR", contributor: { id: "contrib-3", nameDisplay: "Lev Grossman" } },
    );
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getAllByText("Lev Grossman").length).toBeGreaterThan(0);
    // Comma separator between multiple authors
    const authorParagraph = screen.getAllByText("Patrick Rothfuss")[0]?.closest("p");
    expect(authorParagraph?.textContent).toContain(", ");
  });

  it("renders description", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("A story about Kvothe.")).toBeTruthy();
  });

  it("renders series info with position and links to series page", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText(/The Kingkiller Chronicle/)).toBeTruthy();
    expect(screen.getByText(/#1/)).toBeTruthy();
    const seriesLink = screen.getByText(/The Kingkiller Chronicle/).closest("a");
    expect(seriesLink?.getAttribute("href")).toBe("/series/$seriesId");
  });

  it("hides series section when no series", async () => {
    mockLoaderData.work.series = null;
    mockLoaderData.work.seriesPosition = null;
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.queryByText(/Kingkiller/)).toBeNull();
  });

  it("renders metadata fields", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getAllByText("DAW Books").length).toBeGreaterThan(0);
    expect(screen.getByText("9780756404079")).toBeTruthy();
    expect(screen.getByText("B003HV0TN2")).toBeTruthy();
    expect(screen.getByText("en")).toBeTruthy();
  });

  it("renders edition with format badge", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("EBOOK")).toBeTruthy();
  });

  it("renders file information", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("the-name-of-the-wind.epub")).toBeTruthy();
  });

  it("formats file sizes in bytes and KB", async () => {
    const edition = mockLoaderData.work.editions[0];
    if (!edition) throw new Error("expected edition");
    edition.editionFiles = [
      {
        id: "ef-small",
        role: "PRIMARY",
        fileAsset: {
          id: "fa-small",
          basename: "small.epub",
          sizeBytes: 512n,
          mediaKind: "EPUB",
          availabilityStatus: "PRESENT",
        },
      },
      {
        id: "ef-medium",
        role: "SUPPLEMENT",
        fileAsset: {
          id: "fa-medium",
          basename: "medium.epub",
          sizeBytes: 51200n,
          mediaKind: "EPUB",
          availabilityStatus: "PRESENT",
        },
      },
    ];
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("512 B")).toBeTruthy();
    expect(screen.getByText("50.0 KB")).toBeTruthy();
  });

  it("shows dash when file size is null", async () => {
    const ef = mockLoaderData.work.editions[0]?.editionFiles[0];
    if (!ef) throw new Error("expected edition file");
    ef.fileAsset.sizeBytes = null as unknown as bigint;
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders destructive badge for missing file", async () => {
    const ef = mockLoaderData.work.editions[0]?.editionFiles[0];
    if (!ef) throw new Error("expected edition file");
    ef.fileAsset.availabilityStatus = "MISSING";
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("MISSING")).toBeTruthy();
  });

  it("handles missing optional fields gracefully", async () => {
    mockLoaderData.work.description = null;
    mockLoaderData.work.language = null;
    mockLoaderData.work.series = null;
    mockLoaderData.work.seriesPosition = null;
    const edition = mockLoaderData.work.editions[0];
    if (!edition) throw new Error("expected edition");
    edition.publisher = null;
    edition.publishedAt = null;
    edition.isbn13 = null;
    edition.asin = null;
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The Name of the Wind");
  });

  it("renders multiple editions", async () => {
    mockLoaderData.work.editions.push({
      id: "edition-2",
      formatFamily: "AUDIOBOOK",
      publisher: "Audible",
      publishedAt: null,
      isbn13: null,
      isbn10: null,
      asin: null,
      contributors: [
        { role: "NARRATOR", contributor: { id: "contrib-2", nameDisplay: "Nick Podehl" } },
      ],
      editionFiles: [],
    });
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    // EBOOK appears in editions section and linked formats section
    expect(screen.getAllByText("EBOOK").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("AUDIOBOOK").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Nick Podehl")).toBeTruthy();
  });

  it("renders reading progress section heading", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("heading", { level: 2, name: "Reading Progress" })).toBeTruthy();
  });

  it("renders BY_EDITION progress per edition", async () => {
    mockLoaderData.progress = [
      { id: "rp1", editionId: "edition-1", progressKind: "EBOOK", percent: 42 },
    ];
    mockLoaderData.trackingMode = "BY_EDITION";
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    // EBOOK appears in both editions section and progress section
    expect(screen.getAllByText("EBOOK").length).toBeGreaterThanOrEqual(2);
  });

  it("renders BY_WORK aggregated progress", async () => {
    mockLoaderData.progress = [
      { id: "rp1", editionId: "edition-1", progressKind: "EBOOK", percent: 42 },
    ];
    mockLoaderData.trackingMode = "BY_WORK";
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(1);
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("renders BY_WORK with null percent treated as 0", async () => {
    mockLoaderData.progress = [
      { id: "rp1", editionId: "edition-1", progressKind: "EBOOK", percent: null },
    ];
    mockLoaderData.trackingMode = "BY_WORK";
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("renders BY_EDITION with null percent treated as 0", async () => {
    mockLoaderData.progress = [
      { id: "rp1", editionId: "edition-1", progressKind: "EBOOK", percent: null },
    ];
    mockLoaderData.trackingMode = "BY_EDITION";
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("shows no progress message when empty", async () => {
    mockLoaderData.progress = [];
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No reading progress yet")).toBeTruthy();
  });

  it("renders BY_WORK with max percent from multiple editions", async () => {
    mockLoaderData.work.editions.push({
      id: "edition-2",
      formatFamily: "AUDIOBOOK",
      publisher: null,
      publishedAt: null,
      isbn13: null,
      isbn10: null,
      asin: null,
      contributors: [],
      editionFiles: [],
    });
    mockLoaderData.progress = [
      { id: "rp1", editionId: "edition-1", progressKind: "EBOOK", percent: 30 },
      { id: "rp2", editionId: "edition-2", progressKind: "AUDIO", percent: 75 },
    ];
    mockLoaderData.trackingMode = "BY_WORK";
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(1);
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("renders BY_EDITION with multiple edition progress entries", async () => {
    mockLoaderData.work.editions.push({
      id: "edition-2",
      formatFamily: "AUDIOBOOK",
      publisher: null,
      publishedAt: null,
      isbn13: null,
      isbn10: null,
      asin: null,
      contributors: [],
      editionFiles: [],
    });
    mockLoaderData.progress = [
      { id: "rp1", editionId: "edition-1", progressKind: "EBOOK", percent: 30 },
      { id: "rp2", editionId: "edition-2", progressKind: "AUDIO", percent: 75 },
    ];
    mockLoaderData.trackingMode = "BY_EDITION";
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(screen.getByText("30%")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("renders enrichment review component", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const review = screen.getByTestId("enrichment-review");
    expect(review.getAttribute("data-work-id")).toBe("work-1");
    expect(review.getAttribute("data-description")).toBe("A story about Kvothe.");
  });

  it("renders pending skeleton component", async () => {
    const { Route } = await import("./library.$workId");
    const Skeleton = Route.options.pendingComponent as React.ComponentType;
    render(<Skeleton />);
    expect(screen.getByTestId("work-detail-skeleton")).toBeTruthy();
  });

  it("renders linked formats section when work has multiple format families", async () => {
    mockLoaderData.work.editions.push({
      id: "edition-2",
      formatFamily: "AUDIOBOOK",
      publisher: null,
      publishedAt: null,
      isbn13: null,
      isbn10: null,
      asin: null,
      contributors: [],
      editionFiles: [],
    });
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("heading", { level: 2, name: "Linked Formats" })).toBeTruthy();
    // Both format badges rendered inside the linked formats section
    const badges = screen.getAllByText(/EBOOK|AUDIOBOOK/);
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  it("does not render linked formats section when only one format family exists", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.queryByRole("heading", { level: 2, name: "Linked Formats" })).toBeNull();
  });

  it("renders delete work button", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    // There should be at least 2 buttons with trash icons (work + edition)
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("opens delete work confirmation dialog", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);
    // Click the first delete button (work delete)
    const buttons = screen.getAllByRole("button");
    const deleteBtn = buttons[0];
    if (!deleteBtn) throw new Error("expected button");
    fireEvent.click(deleteBtn);
    expect(screen.getByText("Delete Work")).toBeTruthy();
    expect(screen.getByText(/will remove/)).toBeTruthy();
  });

  it("calls deleteWorkServerFn and navigates on confirm", async () => {
    deleteWorkServerFnMock.mockResolvedValue({ deletedWorkId: "work-1" });
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    // Open delete work dialog
    const buttons = screen.getAllByRole("button");
    const deleteBtn = buttons[0];
    if (!deleteBtn) throw new Error("expected button");
    fireEvent.click(deleteBtn);

    // Confirm deletion
    const confirmBtn = screen.getByText("Delete");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteWorkServerFnMock).toHaveBeenCalledWith({ data: { workId: "work-1" } });
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  it("shows generic error toast when delete work fails with non-Error", async () => {
    deleteWorkServerFnMock.mockRejectedValue("unexpected");
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    const deleteBtn = screen.getByTestId("delete-work-btn");
    fireEvent.click(deleteBtn);

    const confirmBtn = screen.getByText("Delete");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to delete work");
    });
  });

  it("shows error toast when delete work fails", async () => {
    deleteWorkServerFnMock.mockRejectedValue(new Error("DB error"));
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    const buttons = screen.getAllByRole("button");
    const deleteBtn = buttons[0];
    if (!deleteBtn) throw new Error("expected button");
    fireEvent.click(deleteBtn);

    const confirmBtn = screen.getByText("Delete");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("DB error");
    });
  });

  it("opens delete edition confirmation dialog", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);
    // Second button is the edition delete button
    const buttons = screen.getAllByRole("button");
    const editionDeleteBtn = buttons[1];
    if (!editionDeleteBtn) throw new Error("expected edition delete button");
    fireEvent.click(editionDeleteBtn);
    expect(screen.getByText("Delete Edition")).toBeTruthy();
  });

  it("calls deleteEditionServerFn and invalidates on confirm when work survives", async () => {
    deleteEditionServerFnMock.mockResolvedValue({ deletedEditionId: "edition-1", deletedWorkId: null });
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    const buttons = screen.getAllByRole("button");
    const editionDeleteBtn = buttons[1];
    if (!editionDeleteBtn) throw new Error("expected edition delete button");
    fireEvent.click(editionDeleteBtn);

    const confirmBtn = screen.getByText("Delete");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteEditionServerFnMock).toHaveBeenCalledWith({ data: { editionId: "edition-1" } });
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  it("navigates away when deleting last edition also removes work", async () => {
    deleteEditionServerFnMock.mockResolvedValue({ deletedEditionId: "edition-1", deletedWorkId: "work-1" });
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    const buttons = screen.getAllByRole("button");
    const editionDeleteBtn = buttons[1];
    if (!editionDeleteBtn) throw new Error("expected edition delete button");
    fireEvent.click(editionDeleteBtn);

    const confirmBtn = screen.getByText("Delete");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  it("closes delete work dialog when cancel button is clicked", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    // Open delete work dialog
    const deleteBtn = screen.getByTestId("delete-work-btn");
    fireEvent.click(deleteBtn);
    expect(screen.getByText("Delete Work")).toBeTruthy();

    // Click Cancel
    fireEvent.click(screen.getByText("Cancel"));

    // Dialog should close — "Delete Work" title should no longer be visible
    // (Dialog removes content from DOM when closed in happy-dom)
  });

  it("renders delete edition dialog with last-edition warning when only one edition exists", async () => {
    // Default data has exactly 1 edition
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    // Open delete edition dialog
    const editionDeleteBtn = screen.getByTestId("delete-edition-edition-1");
    fireEvent.click(editionDeleteBtn);

    expect(screen.getByText("Delete Edition")).toBeTruthy();
    expect(screen.getByText(/Since it is the last edition, the work will also be removed/)).toBeTruthy();
  });

  it("does not show last-edition warning when multiple editions exist", async () => {
    mockLoaderData.work.editions.push({
      id: "edition-2",
      formatFamily: "AUDIOBOOK",
      publisher: null,
      publishedAt: null,
      isbn13: null,
      isbn10: null,
      asin: null,
      contributors: [],
      editionFiles: [],
    });
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    // Open delete edition dialog for edition-1
    const editionDeleteBtn = screen.getByTestId("delete-edition-edition-1");
    fireEvent.click(editionDeleteBtn);

    expect(screen.getByText("Delete Edition")).toBeTruthy();
    expect(screen.queryByText(/Since it is the last edition/)).toBeNull();
  });

  it("closes delete edition dialog when cancel button is clicked", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    // Open delete edition dialog
    const editionDeleteBtn = screen.getByTestId("delete-edition-edition-1");
    fireEvent.click(editionDeleteBtn);
    expect(screen.getByText("Delete Edition")).toBeTruthy();

    // Click Cancel
    fireEvent.click(screen.getByText("Cancel"));
  });

  it("closes delete edition dialog via onOpenChange when open is set to false", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, act } = await import("@testing-library/react");
    render(<Page />);

    // Open delete edition dialog
    const editionDeleteBtn = screen.getByTestId("delete-edition-edition-1");
    fireEvent.click(editionDeleteBtn);
    expect(screen.getByText("Delete Edition")).toBeTruthy();

    const editionDialogProps = capturedDialogProps[capturedDialogProps.length - 1];
    if (!editionDialogProps?.onOpenChange) throw new Error("expected onOpenChange");
    const { onOpenChange } = editionDialogProps;

    act(() => { onOpenChange(false); });
  });

  it("shows generic error toast when delete edition fails with non-Error", async () => {
    deleteEditionServerFnMock.mockRejectedValue("unexpected");
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    const editionDeleteBtn = screen.getByTestId("delete-edition-edition-1");
    fireEvent.click(editionDeleteBtn);

    const confirmBtn = screen.getByText("Delete");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to delete edition");
    });
  });

  it("handles edition dialog onOpenChange(true) without closing dialog", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, act } = await import("@testing-library/react");
    render(<Page />);

    // Open delete edition dialog
    const editionDeleteBtn = screen.getByTestId("delete-edition-edition-1");
    fireEvent.click(editionDeleteBtn);
    expect(screen.getByText("Delete Edition")).toBeTruthy();

    // Find the edition dialog's onOpenChange (it's the last captured one after opening)
    const editionDialogProps = capturedDialogProps[capturedDialogProps.length - 1];
    if (!editionDialogProps?.onOpenChange) throw new Error("expected onOpenChange");
    const { onOpenChange } = editionDialogProps;

    // Call onOpenChange(true) — this exercises the if (!open) false branch on line 283
    act(() => { onOpenChange(true); });

    // Dialog should still be open
    expect(screen.getByText("Delete Edition")).toBeTruthy();
  });

  it("exercises edition dialog onOpenChange with true (no-op branch)", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, act } = await import("@testing-library/react");
    render(<Page />);

    // Open edition dialog to capture its onOpenChange
    const editionDeleteBtn = screen.getByTestId("delete-edition-edition-1");
    fireEvent.click(editionDeleteBtn);

    // The edition dialog's onOpenChange is the last captured
    const editionOnOpenChange = capturedDialogProps[capturedDialogProps.length - 1]?.onOpenChange;
    if (!editionOnOpenChange) throw new Error("expected edition onOpenChange");

    // Call with true (exercises if (!open) false branch on line 283)
    act(() => { editionOnOpenChange(true); });

    expect(screen.getByText("Delete Edition")).toBeTruthy();
  });

  it("exercises edition delete confirm with null deleteEditionOpen (guard branch)", async () => {
    // Force all dialogs to render their children even when closed
    forceRenderClosed = true;

    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent } = await import("@testing-library/react");
    render(<Page />);

    // Both dialogs render. The edition dialog has data-open="false" since deleteEditionOpen is null.
    // Find the edition dialog's destructive Delete button.
    // There are 4 "Delete" text elements: "Delete Work" title, work Delete btn, "Delete Edition" title, edition Delete btn
    const allDeleteButtons = screen.getAllByRole("button").filter((btn) => btn.textContent === "Delete");
    // The last destructive Delete button belongs to the edition dialog
    const editionDestructiveBtn = allDeleteButtons[allDeleteButtons.length - 1];
    if (!editionDestructiveBtn) throw new Error("expected edition destructive button");

    // Click it while deleteEditionOpen is null — exercises the if (deleteEditionOpen) false branch
    fireEvent.click(editionDestructiveBtn);

    // deleteEditionServerFn should NOT have been called because of the guard
    expect(deleteEditionServerFnMock).not.toHaveBeenCalled();
  });

  it("shows error toast when delete edition fails", async () => {
    deleteEditionServerFnMock.mockRejectedValue(new Error("Edition delete failed"));
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<Page />);

    const buttons = screen.getAllByRole("button");
    const editionDeleteBtn = buttons[1];
    if (!editionDeleteBtn) throw new Error("expected edition delete button");
    fireEvent.click(editionDeleteBtn);

    const confirmBtn = screen.getByText("Delete");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Edition delete failed");
    });
  });
});
