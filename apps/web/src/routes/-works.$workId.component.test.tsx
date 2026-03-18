import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const useServerFnMock = vi.fn((fn) => fn);

vi.mock("../lib/library-server", () => ({
  addWorkToCollectionServerFn: vi.fn(),
  createExternalLinkServerFn: vi.fn(),
  deleteExternalLinkServerFn: vi.fn(),
  getWorkProgressViewServerFn: vi.fn(),
  removeWorkFromCollectionServerFn: vi.fn(),
  updateExternalLinkServerFn: vi.fn(),
  updateWorkProgressTrackingModeServerFn: vi.fn(),
}));

vi.mock("../lib/auth-client", () => ({
  getCurrentUserServerFn: vi.fn(),
}));

vi.mock("@tanstack/react-start", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-start")>("@tanstack/react-start");
  return {
    ...actual,
    useServerFn: useServerFnMock,
  };
});

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
    useRouter: () => ({
      invalidate: vi.fn(async () => undefined),
      navigate: vi.fn(async () => undefined),
    }),
  };
});

describe("work detail component", () => {
  it("renders the hybrid detail layout with management sections", async () => {
    const workModule = await import("./works.$workId");
    vi.spyOn(workModule.Route, "useLoaderData").mockReturnValue({
      work: {
        collections: [
          {
            containsWork: true,
            id: "collection-1",
            itemCount: 1,
            kind: "MANUAL",
            name: "Favorites",
          },
        ],
        contributorGroups: [
          {
            names: ["N. K. Jemisin"],
            role: "AUTHOR",
          },
          {
            names: ["Robin Miles"],
            role: "NARRATOR",
          },
        ],
        description: "A season of endings and survival.",
        editions: [
          {
            asin: "B123",
            contributors: [
              {
                name: "N. K. Jemisin",
                role: "AUTHOR",
              },
            ],
            externalLinks: [
              {
                editionId: "edition-1",
                externalId: "OL1",
                id: "external-link-1",
                lastSyncedAt: "2025-01-01T10:00:00.000Z",
                metadata: "{\n  \"source\": \"manual\"\n}",
                provider: "openlibrary",
              },
            ],
            files: [
              {
                basename: "fifth-season.epub",
                createdAt: "2025-01-01T00:00:00.000Z",
                extension: "epub",
                id: "file-1",
                mediaKind: "EPUB",
                modifiedAt: "2025-01-02T00:00:00.000Z",
                relativePath: "ebooks/fifth-season.epub",
                role: "PRIMARY",
                sizeBytes: "2048",
              },
            ],
            formatFamily: "EBOOK",
            id: "edition-1",
            isbn10: "0316498840",
            isbn13: "9780316498834",
            publishedAt: "2015-08-04T00:00:00.000Z",
            publisher: "Orbit",
          },
        ],
        effectiveMode: "BY_WORK",
        formatFamilies: ["AUDIOBOOK", "EBOOK"],
        globalMode: "BY_WORK",
        language: "en",
        overrideMode: "BY_EDITION",
        progressRows: [
          {
            editionId: "edition-1",
            formatFamily: "EBOOK",
            id: "progress-1",
            locator: { cfi: {} },
            percent: 0.5,
            progressKind: "EBOOK",
            source: "kobo",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        series: {
          id: "series-1",
          name: "The Broken Earth",
        },
        sortTitle: "Fifth Season, The",
        summary: {
          percent: 0.5,
          progressKind: "EBOOK",
          source: "kobo",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
        workId: "work-1",
        workTitle: "The Fifth Season",
      },
    } as never);

    const html = renderToStaticMarkup(<workModule.WorkDetailRoute />);

    expect(html).toContain("Book Detail");
    expect(html).toContain("The Fifth Season");
    expect(html).toContain("The Broken Earth");
    expect(html).toContain("Narrated by Robin Miles");
    expect(html).toContain("Reading state");
    expect(html).toContain("Shelves");
    expect(html).toContain("Operational files");
    expect(html).toContain("External links");
    expect(html).toContain("ebooks/fifth-season.epub");
    expect(html).toContain("Add external link");
  });
});
