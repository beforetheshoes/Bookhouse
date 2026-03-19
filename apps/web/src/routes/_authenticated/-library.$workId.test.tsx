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
    contributors: { role: string; contributor: { nameDisplay: string } }[];
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

let mockLoaderData: { work: MockWork } = {
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
          { role: "AUTHOR", contributor: { nameDisplay: "Patrick Rothfuss" } },
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
              { role: "AUTHOR", contributor: { nameDisplay: "Patrick Rothfuss" } },
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
    };
    vi.clearAllMocks();
  });

  it("loader calls getWorkDetailServerFn with workId", async () => {
    getWorkDetailServerFnMock.mockResolvedValueOnce(mockLoaderData.work);
    const { Route } = await import("./library.$workId");
    const result = await (Route.options.loader as (args: { params: { workId: string } }) => Promise<unknown>)({
      params: { workId: "work-1" },
    });
    expect(getWorkDetailServerFnMock).toHaveBeenCalledWith({
      data: { workId: "work-1" },
    });
    expect(result).toEqual({ work: mockLoaderData.work });
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

  it("renders authors", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getAllByText("Patrick Rothfuss").length).toBeGreaterThan(0);
  });

  it("renders description", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("A story about Kvothe.")).toBeTruthy();
  });

  it("renders series info with position", async () => {
    const { Route } = await import("./library.$workId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText(/The Kingkiller Chronicle/)).toBeTruthy();
    expect(screen.getByText(/#1/)).toBeTruthy();
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
        { role: "NARRATOR", contributor: { nameDisplay: "Nick Podehl" } },
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

  it("renders pending skeleton component", async () => {
    const { Route } = await import("./library.$workId");
    const Skeleton = Route.options.pendingComponent as React.ComponentType;
    render(<Skeleton />);
    expect(screen.getByTestId("work-detail-skeleton")).toBeTruthy();
  });
});
