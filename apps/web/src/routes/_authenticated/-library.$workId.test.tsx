// @vitest-environment happy-dom
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

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: unknown }) => <a href={to} {...props}>{children}</a>,
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

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
    expect(screen.getByText("EBOOK")).toBeTruthy();
    expect(screen.getByText("AUDIOBOOK")).toBeTruthy();
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
});
