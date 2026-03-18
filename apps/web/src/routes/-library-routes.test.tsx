import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressTrackingMode } from "@bookhouse/domain";

const getCurrentUserServerFnMock = vi.fn();
const addWorkToCollectionServerFnMock = vi.fn();
const createCollectionServerFnMock = vi.fn();
const createExternalLinkServerFnMock = vi.fn();
const deleteCollectionServerFnMock = vi.fn();
const deleteExternalLinkServerFnMock = vi.fn();
const getCollectionDetailServerFnMock = vi.fn();
const getAudioLinkDetailServerFnMock = vi.fn();
const getDuplicateCandidateDetailServerFnMock = vi.fn();
const getUserProgressTrackingModeServerFnMock = vi.fn();
const getWorkProgressViewServerFnMock = vi.fn();
const listExternalLinksForWorkServerFnMock = vi.fn();
const listLibraryWorksServerFnMock = vi.fn();
const listCollectionsServerFnMock = vi.fn();
const listAudioLinksServerFnMock = vi.fn();
const listDuplicateCandidatesServerFnMock = vi.fn();
const mergeDuplicateCandidateServerFnMock = vi.fn();
const removeWorkFromCollectionServerFnMock = vi.fn();
const renameCollectionServerFnMock = vi.fn();
const updateExternalLinkServerFnMock = vi.fn();
const updateAudioLinkStatusServerFnMock = vi.fn();
const updateDuplicateCandidateStatusServerFnMock = vi.fn();
const updateUserProgressTrackingModeServerFnMock = vi.fn();
const updateWorkProgressTrackingModeServerFnMock = vi.fn();
const useServerFnMock = vi.fn((fn) => fn);

vi.mock("../lib/auth-client", () => ({
  getCurrentUserServerFn: getCurrentUserServerFnMock,
}));

vi.mock("../lib/library-server", () => ({
  addWorkToCollectionServerFn: addWorkToCollectionServerFnMock,
  createCollectionServerFn: createCollectionServerFnMock,
  createExternalLinkServerFn: createExternalLinkServerFnMock,
  deleteCollectionServerFn: deleteCollectionServerFnMock,
  deleteExternalLinkServerFn: deleteExternalLinkServerFnMock,
  getCollectionDetailServerFn: getCollectionDetailServerFnMock,
  getAudioLinkDetailServerFn: getAudioLinkDetailServerFnMock,
  getDuplicateCandidateDetailServerFn: getDuplicateCandidateDetailServerFnMock,
  getUserProgressTrackingModeServerFn: getUserProgressTrackingModeServerFnMock,
  getWorkProgressViewServerFn: getWorkProgressViewServerFnMock,
  listExternalLinksForWorkServerFn: listExternalLinksForWorkServerFnMock,
  listLibraryWorksServerFn: listLibraryWorksServerFnMock,
  listCollectionsServerFn: listCollectionsServerFnMock,
  listAudioLinksServerFn: listAudioLinksServerFnMock,
  listDuplicateCandidatesServerFn: listDuplicateCandidatesServerFnMock,
  mergeDuplicateCandidateServerFn: mergeDuplicateCandidateServerFnMock,
  removeWorkFromCollectionServerFn: removeWorkFromCollectionServerFnMock,
  renameCollectionServerFn: renameCollectionServerFnMock,
  updateExternalLinkServerFn: updateExternalLinkServerFnMock,
  updateAudioLinkStatusServerFn: updateAudioLinkStatusServerFnMock,
  updateDuplicateCandidateStatusServerFn: updateDuplicateCandidateStatusServerFnMock,
  updateUserProgressTrackingModeServerFn: updateUserProgressTrackingModeServerFnMock,
  updateWorkProgressTrackingModeServerFn: updateWorkProgressTrackingModeServerFnMock,
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
    Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a {...props}>{children}</a>
    ),
    useRouter: () => ({
      invalidate: vi.fn(async () => undefined),
      navigate: vi.fn(async () => undefined),
    }),
  };
});

describe("library routes", () => {
  beforeEach(() => {
    getCurrentUserServerFnMock.mockReset();
    addWorkToCollectionServerFnMock.mockReset();
    createCollectionServerFnMock.mockReset();
    createExternalLinkServerFnMock.mockReset();
    deleteCollectionServerFnMock.mockReset();
    deleteExternalLinkServerFnMock.mockReset();
    getCollectionDetailServerFnMock.mockReset();
    getAudioLinkDetailServerFnMock.mockReset();
    getDuplicateCandidateDetailServerFnMock.mockReset();
    getUserProgressTrackingModeServerFnMock.mockReset();
    getWorkProgressViewServerFnMock.mockReset();
    listExternalLinksForWorkServerFnMock.mockReset();
    listLibraryWorksServerFnMock.mockReset();
    listCollectionsServerFnMock.mockReset();
    listAudioLinksServerFnMock.mockReset();
    listDuplicateCandidatesServerFnMock.mockReset();
    mergeDuplicateCandidateServerFnMock.mockReset();
    removeWorkFromCollectionServerFnMock.mockReset();
    renameCollectionServerFnMock.mockReset();
    updateExternalLinkServerFnMock.mockReset();
    updateAudioLinkStatusServerFnMock.mockReset();
    updateDuplicateCandidateStatusServerFnMock.mockReset();
    updateUserProgressTrackingModeServerFnMock.mockReset();
    updateWorkProgressTrackingModeServerFnMock.mockReset();
  });

  it("loads audio link list data and renders the review page", async () => {
    const { AudioLinksRoute, Route } = await import("./audio-links");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listAudioLinksServerFnMock.mockResolvedValueOnce([
      {
        audioLabel: "Audio",
        audioWorkId: "work-audio",
        confidence: 1,
        ebookLabel: "Ebook",
        ebookWorkId: "work-ebook",
        id: "audio-link-1",
        matchType: "SAME_WORK",
        reviewStatus: "PENDING",
      },
    ]);
    const loader = Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      location: {
        pathname: "/audio-links",
        search: "?status=PENDING",
      },
      serverContext: {},
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);
    const html = renderToStaticMarkup(<AudioLinksRoute />);

    expect(html).toContain("Audio Link Review");
  });

  it("uses default audio link filters and hides confidence when it is missing", async () => {
    const { AudioLinksRoute, Route } = await import("./audio-links");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listAudioLinksServerFnMock.mockResolvedValueOnce([
      {
        audioLabel: "Audio",
        audioWorkId: "work-audio",
        confidence: null,
        ebookLabel: "Ebook",
        ebookWorkId: "work-ebook",
        id: "audio-link-2",
        matchType: "EXACT_METADATA",
        reviewStatus: "PENDING",
      },
    ]);
    const loader = Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      location: {
        pathname: "/audio-links",
        search: "",
      },
      serverContext: {},
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);
    const html = renderToStaticMarkup(<AudioLinksRoute />);

    expect(listAudioLinksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        status: "PENDING",
      },
    });
    expect(html).toContain("Reviewing pending audio link candidates.");
    expect(html).not.toContain("confidence");
  });

  it("loads audio link filters from parsed location search objects", async () => {
    const { Route } = await import("./audio-links");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listAudioLinksServerFnMock.mockResolvedValueOnce([]);

    const loader = Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
        searchStr?: string;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/audio-links",
        search: { status: "ALL" },
        searchStr: "?status=ALL",
      },
      serverContext: {},
    });

    expect(listAudioLinksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        status: "ALL",
      },
    });
  });

  it("loads audio link filters from parsed search objects without searchStr", async () => {
    const { Route } = await import("./audio-links");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listAudioLinksServerFnMock.mockResolvedValueOnce([]);

    const loader = Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/audio-links",
        search: { status: "ALL" },
      },
      serverContext: {},
    });

    expect(listAudioLinksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        status: "ALL",
      },
    });
  });

  it("defaults audio link filters when parsed location search values are not strings", async () => {
    const { Route } = await import("./audio-links");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listAudioLinksServerFnMock.mockResolvedValueOnce([]);

    const loader = Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/audio-links",
        search: { status: 123 },
      },
      serverContext: {},
    });

    expect(listAudioLinksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        status: "PENDING",
      },
    });
  });

  it("defaults audio link filters when location search is missing", async () => {
    const { Route } = await import("./audio-links");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listAudioLinksServerFnMock.mockResolvedValueOnce([]);

    const loader = Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/audio-links",
      },
      serverContext: {},
    });

    expect(listAudioLinksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        status: "PENDING",
      },
    });
  });

  it("loads audio link detail data and renders the detail page", async () => {
    const { Route } = await import("./audio-links.$linkId");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    getAudioLinkDetailServerFnMock.mockResolvedValueOnce({
      audioAuthors: ["Author"],
      audioFileCount: 1,
      audioHashes: ["hash-audio"],
      audioIsbns: [],
      audioLabel: "Audio",
      audioPaths: ["audio/book.m4b"],
      audioWorkId: "work-audio",
      confidence: 1,
      ebookAuthors: ["Author"],
      ebookFileCount: 1,
      ebookHashes: ["hash-ebook"],
      ebookIsbns: ["isbn"],
      ebookLabel: "Ebook",
      ebookPaths: ["ebooks/book.epub"],
      ebookWorkId: "work-ebook",
      id: "audio-link-1",
      matchType: "SAME_WORK",
      reviewStatus: "PENDING",
    });
    const loader = Route.options.loader as unknown as (input: {
      params: { linkId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      params: { linkId: "audio-link-1" },
      serverContext: {},
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);
    const DetailComponent = Route.options.component as () => React.ReactElement;
    const html = renderToStaticMarkup(<DetailComponent />);

    expect(html).toContain("Audio Link audio-link-1");
    expect(html.match(/Open work/g)).toHaveLength(2);
  });

  it("renders empty audio link detail metadata as None", async () => {
    const { Route } = await import("./audio-links.$linkId");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    getAudioLinkDetailServerFnMock.mockResolvedValueOnce({
      audioAuthors: [],
      audioFileCount: 0,
      audioHashes: [],
      audioIsbns: [],
      audioLabel: "Audio",
      audioPaths: [],
      audioWorkId: "work-audio",
      confidence: null,
      ebookAuthors: [],
      ebookFileCount: 0,
      ebookHashes: [],
      ebookIsbns: [],
      ebookLabel: "Ebook",
      ebookPaths: [],
      ebookWorkId: "work-ebook",
      id: "audio-link-empty",
      matchType: "EXACT_METADATA",
      reviewStatus: "IGNORED",
    });
    const loader = Route.options.loader as unknown as (input: {
      params: { linkId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      params: { linkId: "audio-link-empty" },
      serverContext: {},
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);
    const DetailComponent = Route.options.component as () => React.ReactElement;
    const html = renderToStaticMarkup(<DetailComponent />);

    expect(html.match(/None/g)).toHaveLength(6);
  });

  it("handles empty audio link lists", async () => {
    const audioLinksModule = await import("./audio-links");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listAudioLinksServerFnMock.mockResolvedValueOnce([]);

    const loader = audioLinksModule.Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      location: {
        pathname: "/audio-links",
        search: "?status=ALL",
      },
      serverContext: {},
    });

    vi.spyOn(audioLinksModule.Route, "useLoaderData").mockReturnValue(loaderData as never);
    expect(renderToStaticMarkup(<audioLinksModule.AudioLinksRoute />)).toContain(
      "No audio links match the current filter.",
    );
  });

  it("redirects unauthenticated audio review routes and renders the detail not-found component", async () => {
    const audioLinksModule = await import("./audio-links");
    const detailModule = await import("./audio-links.$linkId");
    getCurrentUserServerFnMock.mockResolvedValue(null);

    const listLoader = audioLinksModule.Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const detailLoader = detailModule.Route.options.loader as unknown as (input: {
      params: { linkId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await expect(listLoader({
      location: { pathname: "/audio-links", search: "" },
      serverContext: {},
    })).rejects.toMatchObject({ options: { href: "/auth/login" } });
    await expect(detailLoader({
      params: { linkId: "audio-link-1" },
      serverContext: {},
    })).rejects.toMatchObject({ options: { href: "/auth/login" } });

    const NotFound = detailModule.Route.options.notFoundComponent as React.ComponentType;
    expect(renderToStaticMarkup(<NotFound />)).toContain("Audio link not found.");
  });

  it("throws when an audio link detail loader cannot find the link", async () => {
    const detailModule = await import("./audio-links.$linkId");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    getAudioLinkDetailServerFnMock.mockResolvedValueOnce(null);

    const detailLoader = detailModule.Route.options.loader as unknown as (input: {
      params: { linkId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await expect(detailLoader({
      params: { linkId: "missing-link" },
      serverContext: {},
    })).rejects.toThrow("Audio link not found");
  });

  it("loads duplicate list data and renders the review page", async () => {
    const { DuplicatesRoute, Route } = await import("./duplicates");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listDuplicateCandidatesServerFnMock.mockResolvedValueOnce([
      {
        confidence: 1,
        id: "candidate-1",
        leftLabel: "Left",
        reason: "SAME_HASH",
        rightLabel: "Right",
        status: "PENDING",
      },
    ]);
    const loader = Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      location: {
        pathname: "/duplicates",
        search: "?status=PENDING",
      },
      serverContext: {},
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);
    const html = renderToStaticMarkup(<DuplicatesRoute />);

    expect(html).toContain("Duplicate Review");
  });

  it("uses default duplicate filters and hides confidence when it is missing", async () => {
    const { DuplicatesRoute, Route } = await import("./duplicates");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listDuplicateCandidatesServerFnMock.mockResolvedValueOnce([
      {
        confidence: null,
        id: "candidate-3",
        leftLabel: "Left",
        reason: "SAME_HASH",
        rightLabel: "Right",
        status: "PENDING",
      },
    ]);
    const loader = Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      location: {
        pathname: "/duplicates",
        search: "",
      },
      serverContext: {},
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);
    const html = renderToStaticMarkup(<DuplicatesRoute />);

    expect(listDuplicateCandidatesServerFnMock).toHaveBeenLastCalledWith({
      data: {
        reason: "ALL",
        status: "PENDING",
      },
    });
    expect(html).toContain("Reviewing pending candidates.");
    expect(html).not.toContain("confidence");
  });

  it("loads duplicate filters from parsed location search objects", async () => {
    const { Route } = await import("./duplicates");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listDuplicateCandidatesServerFnMock.mockResolvedValueOnce([]);

    const loader = Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
        searchStr?: string;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/duplicates",
        search: {
          reason: "SAME_HASH",
          status: "ALL",
        },
        searchStr: "?status=ALL&reason=SAME_HASH",
      },
      serverContext: {},
    });

    expect(listDuplicateCandidatesServerFnMock).toHaveBeenLastCalledWith({
      data: {
        reason: "SAME_HASH",
        status: "ALL",
      },
    });
  });

  it("loads duplicate filters from parsed search objects without searchStr", async () => {
    const { Route } = await import("./duplicates");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listDuplicateCandidatesServerFnMock.mockResolvedValueOnce([]);

    const loader = Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/duplicates",
        search: {
          reason: "SAME_HASH",
          status: "ALL",
        },
      },
      serverContext: {},
    });

    expect(listDuplicateCandidatesServerFnMock).toHaveBeenLastCalledWith({
      data: {
        reason: "SAME_HASH",
        status: "ALL",
      },
    });
  });

  it("defaults duplicate filters when parsed location search values are not strings", async () => {
    const { Route } = await import("./duplicates");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listDuplicateCandidatesServerFnMock.mockResolvedValueOnce([]);

    const loader = Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/duplicates",
        search: {
          reason: null,
          status: 123,
        },
      },
      serverContext: {},
    });

    expect(listDuplicateCandidatesServerFnMock).toHaveBeenLastCalledWith({
      data: {
        reason: "ALL",
        status: "PENDING",
      },
    });
  });

  it("defaults duplicate filters when location search is missing", async () => {
    const { Route } = await import("./duplicates");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listDuplicateCandidatesServerFnMock.mockResolvedValueOnce([]);

    const loader = Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/duplicates",
      },
      serverContext: {},
    });

    expect(listDuplicateCandidatesServerFnMock).toHaveBeenLastCalledWith({
      data: {
        reason: "ALL",
        status: "PENDING",
      },
    });
  });

  it("loads duplicate detail data and renders the detail page", async () => {
    const { Route } = await import("./duplicates.$candidateId");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    getDuplicateCandidateDetailServerFnMock.mockResolvedValueOnce({
      id: "candidate-1",
      leftAuthors: ["Author"],
      leftFileCount: 1,
      leftHashes: ["hash-1"],
      leftIsbns: ["isbn"],
      leftLabel: "Left",
      leftPaths: ["left.epub"],
      mergeable: true,
      reason: "SAME_ISBN",
      rightAuthors: ["Author"],
      rightFileCount: 1,
      rightHashes: ["hash-2"],
      rightIsbns: ["isbn"],
      rightLabel: "Right",
      rightPaths: ["right.epub"],
      status: "PENDING",
    });
    const loader = Route.options.loader as unknown as (input: {
      params: { candidateId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      params: { candidateId: "candidate-1" },
      serverContext: {},
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);
    const DetailComponent = Route.options.component as () => React.ReactElement;
    const html = renderToStaticMarkup(<DetailComponent />);

    expect(html).toContain("Candidate candidate-1");
  });

  it("renders duplicate detail links when both works are present", async () => {
    const { Route } = await import("./duplicates.$candidateId");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    getDuplicateCandidateDetailServerFnMock.mockResolvedValueOnce({
      id: "candidate-4",
      leftAuthors: ["Author"],
      leftFileCount: 1,
      leftHashes: ["hash-1"],
      leftIsbns: ["isbn"],
      leftLabel: "Left",
      leftPaths: ["left.epub"],
      leftWorkId: "work-left",
      mergeable: false,
      reason: "SAME_HASH",
      rightAuthors: ["Author"],
      rightFileCount: 1,
      rightHashes: ["hash-2"],
      rightIsbns: ["isbn"],
      rightLabel: "Right",
      rightPaths: ["right.epub"],
      rightWorkId: "work-right",
      status: "PENDING",
    });
    const loader = Route.options.loader as unknown as (input: {
      params: { candidateId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      params: { candidateId: "candidate-4" },
      serverContext: {},
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);
    const DetailComponent = Route.options.component as () => React.ReactElement;
    const html = renderToStaticMarkup(<DetailComponent />);

    expect(html.match(/Open work/g)).toHaveLength(2);
  });

  it("handles empty duplicate lists and non-mergeable duplicate details", async () => {
    const duplicatesModule = await import("./duplicates");
    const detailModule = await import("./duplicates.$candidateId");
    getCurrentUserServerFnMock.mockResolvedValue({ id: "user-1" });
    listDuplicateCandidatesServerFnMock.mockResolvedValueOnce([]);
    getDuplicateCandidateDetailServerFnMock.mockResolvedValueOnce({
      id: "candidate-2",
      leftAuthors: [],
      leftFileCount: 1,
      leftHashes: [],
      leftIsbns: [],
      leftLabel: "Left file",
      leftPaths: ["left.epub"],
      mergeable: false,
      reason: "SAME_HASH",
      rightAuthors: [],
      rightFileCount: 1,
      rightHashes: [],
      rightIsbns: [],
      rightLabel: "Right file",
      rightPaths: ["right.epub"],
      status: "IGNORED",
    });

    const duplicatesLoader = duplicatesModule.Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const duplicatesData = await duplicatesLoader({
      location: {
        pathname: "/duplicates",
        search: "?status=ALL&reason=SAME_HASH",
      },
      serverContext: {},
    });
    vi.spyOn(duplicatesModule.Route, "useLoaderData").mockReturnValue(duplicatesData as never);

    const detailLoader = detailModule.Route.options.loader as unknown as (input: {
      params: { candidateId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const detailData = await detailLoader({
      params: { candidateId: "candidate-2" },
      serverContext: {},
    });
    vi.spyOn(detailModule.Route, "useLoaderData").mockReturnValue(detailData as never);

    expect(renderToStaticMarkup(<duplicatesModule.DuplicatesRoute />)).toContain(
      "No duplicate candidates match the current filter.",
    );
    const DetailComponent = detailModule.Route.options.component as () => React.ReactElement;
    const detailHtml = renderToStaticMarkup(<DetailComponent />);
    expect(detailHtml).not.toContain("Keep left");
    expect(detailHtml).not.toContain("Open work");
  });

  it("loads settings and work progress routes", async () => {
    const settingsModule = await import("./settings");
    const workModule = await import("./works.$workId");
    getCurrentUserServerFnMock.mockResolvedValue({ id: "user-1" });
    getUserProgressTrackingModeServerFnMock.mockResolvedValueOnce(ProgressTrackingMode.BY_WORK);
    getWorkProgressViewServerFnMock.mockResolvedValueOnce({
      collections: [
        {
          containsWork: true,
          id: "collection-1",
          itemCount: 1,
          kind: "MANUAL",
          name: "Favorites",
        },
        {
          containsWork: false,
          id: "collection-2",
          itemCount: 4,
          kind: "MANUAL",
          name: "Queued",
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
      description: "The end of the world is already here.",
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
            {
              editionId: "edition-1",
              externalId: "GR1",
              id: "external-link-2",
              lastSyncedAt: null,
              metadata: "",
              provider: "goodreads",
            },
          ],
          files: [
            {
              basename: "fifth-season.epub",
              createdAt: "2025-01-01T00:00:00.000Z",
              extension: "epub",
              id: "file-1",
              mediaKind: "EPUB",
              modifiedAt: "2025-01-03T00:00:00.000Z",
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
        {
          asin: null,
          contributors: [
            {
              name: "Robin Miles",
              role: "NARRATOR",
            },
          ],
          externalLinks: [],
          files: [],
          formatFamily: "AUDIOBOOK",
          id: "edition-2",
          isbn10: null,
          isbn13: null,
          publishedAt: null,
          publisher: null,
        },
      ],
      effectiveMode: ProgressTrackingMode.BY_WORK,
      formatFamilies: ["AUDIOBOOK", "EBOOK"],
      globalMode: ProgressTrackingMode.BY_WORK,
      language: "en",
      overrideMode: ProgressTrackingMode.BY_EDITION,
      progressRows: [
        {
          editionId: "edition-1",
          formatFamily: "EBOOK",
          id: "progress-1",
          locator: {},
          percent: 0.5,
          progressKind: "EBOOK",
          source: "kobo",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      summary: {
        percent: 0.5,
        progressKind: "EBOOK",
        source: "kobo",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
      series: {
        id: "series-1",
        name: "The Broken Earth",
      },
      sortTitle: "Fifth Season, The",
      workId: "work-1",
      workTitle: "The Fifth Season",
    });
    const settingsLoader = settingsModule.Route.options.loader as unknown as (input: {
      serverContext?: unknown;
    }) => Promise<unknown>;
    const settingsData = await settingsLoader({ serverContext: {} });
    vi.spyOn(settingsModule.Route, "useLoaderData").mockReturnValue(settingsData as never);

    const workLoader = workModule.Route.options.loader as unknown as (input: {
      params: { workId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const workData = await workLoader({
      params: { workId: "work-1" },
      serverContext: {},
    });
    vi.spyOn(workModule.Route, "useLoaderData").mockReturnValue(workData as never);

    expect(renderToStaticMarkup(<settingsModule.SettingsRoute />)).toContain("Settings");
    const workHtml = renderToStaticMarkup(<workModule.WorkDetailRoute />);
    expect(workHtml).toContain("The Fifth Season");
    expect(workHtml).toContain("The Broken Earth");
    expect(workHtml).toContain("N. K. Jemisin");
    expect(workHtml).toContain("Robin Miles");
    expect(workHtml).toContain("By edition");
    expect(workHtml).toContain("Ebook edition edition-1");
    expect(workHtml).toContain("External links");
    expect(workHtml).toContain("openlibrary");
    expect(workHtml).toContain("goodreads");
    expect(workHtml).toContain("Current metadata: None");
    expect(workHtml).toContain("Add external link");
    expect(workHtml).toContain("ebooks/fifth-season.epub");
    expect(workHtml).toContain("Favorites");
    expect(workHtml).toContain("On this shelf");
    expect(workHtml).toContain("Queued");
    expect(workHtml).toContain("Add");
  });

  it("renders work pages without override or summary and throws when entities are missing", async () => {
    const workModule = await import("./works.$workId");
    const detailModule = await import("./duplicates.$candidateId");
    getCurrentUserServerFnMock.mockResolvedValue({ id: "user-1" });
    getWorkProgressViewServerFnMock.mockResolvedValueOnce({
      collections: [],
      contributorGroups: [],
      description: null,
      editions: [
        {
          asin: null,
          contributors: [],
          externalLinks: [],
          files: [],
          formatFamily: "EBOOK",
          id: "edition-empty",
          isbn10: null,
          isbn13: null,
          publishedAt: null,
          publisher: null,
        },
      ],
      effectiveMode: ProgressTrackingMode.BY_WORK,
      formatFamilies: ["EBOOK"],
      globalMode: ProgressTrackingMode.BY_WORK,
      language: null,
      overrideMode: null,
      progressRows: [],
      series: null,
      sortTitle: null,
      summary: null,
      workId: "work-2",
      workTitle: "No Progress Yet",
    });

    const workLoader = workModule.Route.options.loader as unknown as (input: {
      params: { workId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const workData = await workLoader({
      params: { workId: "work-2" },
      serverContext: {},
    });
    vi.spyOn(workModule.Route, "useLoaderData").mockReturnValue(workData as never);

    const workHtml = renderToStaticMarkup(<workModule.WorkDetailRoute />);
    expect(workHtml).toContain("No progress recorded for this work.");
    expect(workHtml).toContain("No contributor credits captured yet.");
    expect(workHtml).toContain("No external links for this edition.");
    expect(workHtml).toContain("This work uses the global progress tracking default.");

    getWorkProgressViewServerFnMock.mockResolvedValueOnce(null);
    await expect(
      workLoader({
        params: { workId: "missing-work" },
        serverContext: {},
      }),
    ).rejects.toThrow("Work not found");

    getDuplicateCandidateDetailServerFnMock.mockResolvedValueOnce(null);
    const detailLoader = detailModule.Route.options.loader as unknown as (input: {
      params: { candidateId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    await expect(
      detailLoader({
        params: { candidateId: "missing-candidate" },
        serverContext: {},
      }),
    ).rejects.toThrow("Duplicate candidate not found");
    const detailModuleRoute = detailModule.Route.options.notFoundComponent as () => React.ReactElement;
    expect(renderToStaticMarkup(detailModuleRoute())).toContain("Duplicate candidate not found.");
  });

  it("renders work summaries with null percentages as zero", async () => {
    const workModule = await import("./works.$workId");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    getWorkProgressViewServerFnMock.mockResolvedValueOnce({
      collections: [],
      contributorGroups: [],
      description: null,
      editions: [],
      effectiveMode: ProgressTrackingMode.BY_WORK,
      formatFamilies: [],
      globalMode: ProgressTrackingMode.BY_EDITION,
      language: null,
      overrideMode: null,
      progressRows: [
        {
          editionId: "edition-7",
          formatFamily: "EBOOK",
          id: "progress-7",
          locator: {},
          percent: null,
          progressKind: "EBOOK",
          source: null,
          updatedAt: "2025-01-04T00:00:00.000Z",
        },
      ],
      series: null,
      sortTitle: null,
      summary: {
        percent: null,
        progressKind: "EBOOK",
        source: null,
        updatedAt: "2025-01-04T00:00:00.000Z",
      },
      workId: "work-7",
      workTitle: "Null Percent",
    });

    const workLoader = workModule.Route.options.loader as unknown as (input: {
      params: { workId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const workData = await workLoader({
      params: { workId: "work-7" },
      serverContext: {},
    });
    vi.spyOn(workModule.Route, "useLoaderData").mockReturnValue(workData as never);

    const workHtml = renderToStaticMarkup(<workModule.WorkDetailRoute />);
    expect(workHtml).toContain("ebook");
    expect(workHtml).toContain("0%");
    expect(workHtml).toContain("Updated 2025-01-04 00:00");
  });

  it("renders work detail formatting fallbacks and file size variants", async () => {
    const workModule = await import("./works.$workId");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    getWorkProgressViewServerFnMock.mockResolvedValueOnce({
      collections: [],
      contributorGroups: [],
      description: null,
      editions: [
        {
          asin: null,
          contributors: [],
          externalLinks: [
            {
              editionId: "edition-formatting",
              externalId: "EXT1",
              id: "external-link-formatting",
              lastSyncedAt: "bad-date",
              metadata: "",
              provider: "openlibrary",
            },
          ],
          files: [
            {
              basename: "bad.bin",
              createdAt: "bad-date",
              extension: null,
              id: "file-bad",
              mediaKind: "OTHER",
              modifiedAt: "bad-date",
              relativePath: "files/bad.bin",
              role: "PRIMARY",
              sizeBytes: "abc",
            },
            {
              basename: "tiny.bin",
              createdAt: null,
              extension: "bin",
              id: "file-tiny",
              mediaKind: "OTHER",
              modifiedAt: null,
              relativePath: "files/tiny.bin",
              role: "SUPPLEMENT",
              sizeBytes: "12",
            },
            {
              basename: "small.epub",
              createdAt: null,
              extension: "epub",
              id: "file-small",
              mediaKind: "EPUB",
              modifiedAt: null,
              relativePath: "files/small.epub",
              role: "SUPPLEMENT",
              sizeBytes: "2048",
            },
            {
              basename: "medium.m4b",
              createdAt: null,
              extension: "m4b",
              id: "file-medium",
              mediaKind: "AUDIO",
              modifiedAt: null,
              relativePath: "files/medium.m4b",
              role: "AUDIO_TRACK",
              sizeBytes: "10485760",
            },
            {
              basename: "large.cbz",
              createdAt: null,
              extension: "cbz",
              id: "file-large",
              mediaKind: "CBZ",
              modifiedAt: null,
              relativePath: "files/large.cbz",
              role: "AUDIO_TRACK",
              sizeBytes: "1073741824",
            },
            {
              basename: "unknown.dat",
              createdAt: null,
              extension: "dat",
              id: "file-unknown",
              mediaKind: "OTHER",
              modifiedAt: null,
              relativePath: "files/unknown.dat",
              role: "SUPPLEMENT",
              sizeBytes: null,
            },
          ],
          formatFamily: "EBOOK",
          id: "edition-formatting",
          isbn10: null,
          isbn13: null,
          publishedAt: "bad-date",
          publisher: null,
        },
      ],
      effectiveMode: ProgressTrackingMode.BY_WORK,
      formatFamilies: ["EBOOK"],
      globalMode: ProgressTrackingMode.BY_WORK,
      language: null,
      overrideMode: null,
      progressRows: [
        {
          editionId: "edition-formatting",
          formatFamily: "EBOOK",
          id: "progress-formatting",
          locator: {},
          percent: 0.2,
          progressKind: "READALOUD",
          source: null,
          updatedAt: "bad-date",
        },
      ],
      series: null,
      sortTitle: null,
      summary: {
        percent: 0.2,
        progressKind: "READALOUD",
        source: null,
        updatedAt: "bad-date",
      },
      workId: "work-formatting",
      workTitle: "Formatting Work",
    });

    const workLoader = workModule.Route.options.loader as unknown as (input: {
      params: { workId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const workData = await workLoader({
      params: { workId: "work-formatting" },
      serverContext: {},
    });
    vi.spyOn(workModule.Route, "useLoaderData").mockReturnValue(workData as never);

    const workHtml = renderToStaticMarkup(<workModule.WorkDetailRoute />);
    expect(workHtml).toContain("read aloud");
    expect(workHtml).toContain("bad-date");
    expect(workHtml).toContain("abc B");
    expect(workHtml).toContain("12 B");
    expect(workHtml).toContain("2.0 KB");
    expect(workHtml).toContain("10.0 MB");
    expect(workHtml).toContain("1.0 GB");
    expect(workHtml).toContain("Unknown size");
  });

  it("submits create, update, and delete external-link actions from work helpers", async () => {
    const workModule = await import("./works.$workId");
    const originalFormData = globalThis.FormData;
    const createExternalLink = vi.fn(async () => undefined);
    const updateExternalLink = vi.fn(async () => undefined);
    const deleteExternalLink = vi.fn(async () => undefined);
    const invalidate = vi.fn(async () => undefined);
    const setPending = vi.fn();
    const reset = vi.fn();

    class FakeFormData {
      private readonly fields: Record<string, string>;

      constructor(target: { fields: Record<string, string> }) {
        this.fields = target.fields;
      }

      get(key: string) {
        return this.fields[key] ?? null;
      }
    }

    // @ts-expect-error test shim for FormData(form)
    globalThis.FormData = FakeFormData;

    workModule.createExternalLinkCreateSubmitHandler({
      createExternalLink,
      editionId: "edition-1",
      router: { invalidate },
      setPending,
    })({
      currentTarget: {
        fields: {
          externalId: "OL1",
          lastSyncedAt: "2025-01-01T10:00",
          metadata: "{\"source\":\"manual\"}",
          provider: "openlibrary",
        },
        reset,
      },
      preventDefault: vi.fn(),
    } as never);

    workModule.createExternalLinkUpdateSubmitHandler({
      linkId: "external-link-1",
      router: { invalidate },
      setPending,
      updateExternalLink,
    })({
      currentTarget: {
        fields: {
          externalId: "GR1",
          lastSyncedAt: "",
          metadata: "{\"shelf\":\"favorites\"}",
          provider: "goodreads",
        },
      },
      preventDefault: vi.fn(),
    } as never);

    workModule.createExternalLinkDeleteClickHandler({
      deleteExternalLink,
      linkId: "external-link-1",
      router: { invalidate },
      setPending,
    })();

    workModule.createExternalLinkCreateSubmitHandler({
      createExternalLink,
      editionId: "edition-2",
      router: { invalidate },
      setPending,
    })({
      currentTarget: {
        fields: {},
        reset: vi.fn(),
      },
      preventDefault: vi.fn(),
    } as never);

    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.FormData = originalFormData;

    expect(createExternalLink).toHaveBeenCalledWith({
      data: {
        editionId: "edition-1",
        externalId: "OL1",
        lastSyncedAt: "2025-01-01T10:00",
        metadata: "{\"source\":\"manual\"}",
        provider: "openlibrary",
      },
    });
    expect(updateExternalLink).toHaveBeenCalledWith({
      data: {
        externalId: "GR1",
        lastSyncedAt: null,
        linkId: "external-link-1",
        metadata: "{\"shelf\":\"favorites\"}",
        provider: "goodreads",
      },
    });
    expect(deleteExternalLink).toHaveBeenCalledWith({
      data: { linkId: "external-link-1" },
    });
    expect(createExternalLink).toHaveBeenNthCalledWith(2, {
      data: {
        editionId: "edition-2",
        externalId: "",
        lastSyncedAt: null,
        metadata: "",
        provider: "",
      },
    });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(4);
  });

  it("loads collection routes and renders empty and populated shelf states", async () => {
    const collectionsModule = await import("./collections");
    const detailModule = await import("./collections.$collectionId");
    getCurrentUserServerFnMock.mockResolvedValue({ id: "user-1" });
    listCollectionsServerFnMock.mockResolvedValueOnce([
      {
        id: "collection-1",
        itemCount: 2,
        kind: "MANUAL",
        name: "Favorites",
      },
    ]);
    getCollectionDetailServerFnMock.mockResolvedValueOnce({
      id: "collection-1",
      itemCount: 2,
      kind: "MANUAL",
      name: "Favorites",
      works: [
        { id: "work-1", titleDisplay: "The Fifth Season" },
        { id: "work-2", titleDisplay: "The Obelisk Gate" },
      ],
    });

    const listLoader = collectionsModule.Route.options.loader as unknown as (input: {
      serverContext?: unknown;
    }) => Promise<unknown>;
    const listData = await listLoader({ serverContext: {} });
    vi.spyOn(collectionsModule.Route, "useLoaderData").mockReturnValue(listData as never);
    const listHtml = renderToStaticMarkup(<collectionsModule.CollectionsRoute />);
    expect(listHtml).toContain("Collections");
    expect(listHtml).toContain("Favorites");
    expect(listHtml).toContain("Open shelf");

    const detailLoader = detailModule.Route.options.loader as unknown as (input: {
      params: { collectionId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const detailData = await detailLoader({
      params: { collectionId: "collection-1" },
      serverContext: {},
    });
    vi.spyOn(detailModule.Route, "useLoaderData").mockReturnValue(detailData as never);
    const detailHtml = renderToStaticMarkup(<detailModule.CollectionDetailRoute />);
    expect(detailHtml).toContain("Delete shelf");
    expect(detailHtml).toContain("The Fifth Season");

    listCollectionsServerFnMock.mockResolvedValueOnce([
      {
        id: "collection-2",
        itemCount: 1,
        kind: "MANUAL",
        name: "Reading",
      },
    ]);
    const singularData = await listLoader({ serverContext: {} });
    vi.spyOn(collectionsModule.Route, "useLoaderData").mockReturnValue(singularData as never);
    expect(renderToStaticMarkup(<collectionsModule.CollectionsRoute />)).toContain("1 item");

    listCollectionsServerFnMock.mockResolvedValueOnce([]);
    const emptyData = await listLoader({ serverContext: {} });
    vi.spyOn(collectionsModule.Route, "useLoaderData").mockReturnValue(emptyData as never);
    expect(renderToStaticMarkup(<collectionsModule.CollectionsRoute />)).toContain("No collections yet.");

    getCollectionDetailServerFnMock.mockResolvedValueOnce({
      id: "collection-2",
      itemCount: 1,
      kind: "MANUAL",
      name: "Reading",
      works: [],
    });
    const emptyDetailData = await detailLoader({
      params: { collectionId: "collection-2" },
      serverContext: {},
    });
    vi.spyOn(detailModule.Route, "useLoaderData").mockReturnValue(emptyDetailData as never);
    const emptyDetailHtml = renderToStaticMarkup(<detailModule.CollectionDetailRoute />);
    expect(emptyDetailHtml).toContain("1 item on this shelf.");
    expect(emptyDetailHtml).toContain("This shelf is empty.");
  });

  it("loads the library route and renders populated and filtered empty states", async () => {
    const libraryModule = await import("./library");
    getCurrentUserServerFnMock.mockResolvedValue({ id: "user-1" });
    listLibraryWorksServerFnMock.mockResolvedValueOnce([
      {
        authors: ["N. K. Jemisin"],
        editionCount: 2,
        formatFamilies: ["AUDIOBOOK", "EBOOK"],
        latestProgress: {
          percent: 0.5,
          progressKind: "EBOOK",
          source: "kobo",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
        shelves: ["Favorites", "Queued"],
        titleDisplay: "The Fifth Season",
        workId: "work-1",
      },
    ]);

    const loader = libraryModule.Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      location: {
        pathname: "/library",
        search: "?sort=recent-progress&filter=with-progress",
      },
      serverContext: {},
    });
    vi.spyOn(libraryModule.Route, "useLoaderData").mockReturnValue(loaderData as never);

    const html = renderToStaticMarkup(<libraryModule.LibraryRoute />);
    expect(listLibraryWorksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        filter: "with-progress",
        sort: "recent-progress",
      },
    });
    expect(html).toContain("Library");
    expect(html).toContain("The Fifth Season");
    expect(html).toContain("N. K. Jemisin");
    expect(html).toContain("audiobook, ebook");
    expect(html).toContain("Favorites, Queued");
    expect(html).toContain("50% ebook via kobo");
    expect(html).toContain("Open work");

    listLibraryWorksServerFnMock.mockResolvedValueOnce([]);
    const emptyData = await loader({
      location: {
        pathname: "/library",
        search: "?filter=without-progress",
      },
      serverContext: {},
    });
    vi.spyOn(libraryModule.Route, "useLoaderData").mockReturnValue(emptyData as never);
    const emptyHtml = renderToStaticMarkup(<libraryModule.LibraryRoute />);
    expect(emptyHtml).toContain("No works match the current filters.");
  });

  it("renders library works without progress", async () => {
    const libraryModule = await import("./library");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listLibraryWorksServerFnMock.mockResolvedValueOnce([
      {
        authors: [],
        editionCount: 1,
        formatFamilies: ["EBOOK"],
        latestProgress: null,
        shelves: [],
        titleDisplay: "No Progress Yet",
        workId: "work-2",
      },
    ]);

    const loader = libraryModule.Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      location: {
        pathname: "/library",
        search: "",
      },
      serverContext: {},
    });
    vi.spyOn(libraryModule.Route, "useLoaderData").mockReturnValue(loaderData as never);

    const html = renderToStaticMarkup(<libraryModule.LibraryRoute />);
    expect(html).toContain("Unknown author");
    expect(html).toContain("No shelves");
    expect(html).toContain("No progress yet");
  });

  it("renders library works with empty formats and null percent progress", async () => {
    const libraryModule = await import("./library");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listLibraryWorksServerFnMock.mockResolvedValueOnce([
      {
        authors: ["Author"],
        editionCount: 0,
        formatFamilies: [],
        latestProgress: {
          percent: null,
          progressKind: "EBOOK",
          source: null,
          updatedAt: "2025-01-05T00:00:00.000Z",
        },
        shelves: ["Shelf One"],
        titleDisplay: "Null Percent Work",
        workId: "work-3",
      },
    ]);

    const loader = libraryModule.Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      location: {
        pathname: "/library",
        search: "",
      },
      serverContext: {},
    });
    vi.spyOn(libraryModule.Route, "useLoaderData").mockReturnValue(loaderData as never);

    const html = renderToStaticMarkup(<libraryModule.LibraryRoute />);
    expect(html).toContain("Formats: None");
    expect(html).toContain("0% ebook");
    expect(html).not.toContain("via ");
  });

  it("loads library filters from parsed location search objects", async () => {
    const libraryModule = await import("./library");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listLibraryWorksServerFnMock.mockResolvedValueOnce([]);

    const loader = libraryModule.Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
        searchStr?: string;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/library",
        search: {
          filter: "with-progress",
          sort: "recent-progress",
        },
        searchStr: "?sort=recent-progress&filter=with-progress",
      },
      serverContext: {},
    });

    expect(listLibraryWorksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        filter: "with-progress",
        sort: "recent-progress",
      },
    });
  });

  it("loads library filters from parsed search objects without searchStr", async () => {
    const libraryModule = await import("./library");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listLibraryWorksServerFnMock.mockResolvedValueOnce([]);

    const loader = libraryModule.Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/library",
        search: {
          filter: "with-progress",
          sort: "recent-progress",
        },
      },
      serverContext: {},
    });

    expect(listLibraryWorksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        filter: "with-progress",
        sort: "recent-progress",
      },
    });
  });

  it("defaults library filters when parsed location search values are not strings", async () => {
    const libraryModule = await import("./library");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listLibraryWorksServerFnMock.mockResolvedValueOnce([]);

    const loader = libraryModule.Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/library",
        search: {
          filter: false,
          sort: 99,
        },
      },
      serverContext: {},
    });

    expect(listLibraryWorksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        filter: "all",
        sort: "title-asc",
      },
    });
  });

  it("defaults library filters when location search is missing", async () => {
    const libraryModule = await import("./library");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listLibraryWorksServerFnMock.mockResolvedValueOnce([]);

    const loader = libraryModule.Route.options.loader as unknown as (input: {
      location: {
        pathname: string;
      };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await loader({
      location: {
        pathname: "/library",
      },
      serverContext: {},
    });

    expect(listLibraryWorksServerFnMock).toHaveBeenLastCalledWith({
      data: {
        filter: "all",
        sort: "title-asc",
      },
    });
  });

  it("renders library route defaults when loader data is malformed", async () => {
    const libraryModule = await import("./library");
    vi.spyOn(libraryModule.Route, "useLoaderData").mockReturnValue({
      filter: 7,
      sort: false,
      works: null,
    } as never);

    const html = renderToStaticMarkup(<libraryModule.LibraryRoute />);

    expect(html).toContain("No works in your library yet.");
  });

  it("executes collection route helper actions", async () => {
    const collectionsModule = await import("./collections");
    const detailModule = await import("./collections.$collectionId");
    const createCollection = vi.fn(async () => undefined);
    const resetName = vi.fn();
    const renameCollection = vi.fn(async () => undefined);
    const deleteCollection = vi.fn(async () => undefined);

    await collectionsModule.createCollectionAndReset(createCollection, " Favorites ", resetName);
    await detailModule.renameCollectionById(renameCollection, "collection-1", " Renamed ");
    await detailModule.deleteCollectionById(deleteCollection, "collection-1");

    expect(createCollection).toHaveBeenCalledWith({
      data: {
        name: "Favorites",
      },
    });
    expect(resetName).toHaveBeenCalledTimes(1);
    expect(renameCollection).toHaveBeenCalledWith({
      data: {
        collectionId: "collection-1",
        name: "Renamed",
      },
    });
    expect(deleteCollection).toHaveBeenCalledWith({
      data: {
        collectionId: "collection-1",
      },
    });
  });

  it("handles missing collections and redirects unauthenticated collection routes", async () => {
    const collectionsModule = await import("./collections");
    const detailModule = await import("./collections.$collectionId");
    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    getCollectionDetailServerFnMock.mockResolvedValueOnce(null);

    const detailLoader = detailModule.Route.options.loader as unknown as (input: {
      params: { collectionId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    await expect(
      detailLoader({
        params: { collectionId: "missing-collection" },
        serverContext: {},
      }),
    ).rejects.toThrow("Collection not found");

    getCurrentUserServerFnMock.mockResolvedValue(null);
    const listLoader = collectionsModule.Route.options.loader as unknown as (input: {
      serverContext?: unknown;
    }) => Promise<unknown>;
    await expect(listLoader({ serverContext: {} })).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
    await expect(
      detailLoader({
        params: { collectionId: "collection-1" },
        serverContext: {},
      }),
    ).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
  });

  it("redirects unauthenticated library requests and renders the base empty state", async () => {
    const libraryModule = await import("./library");
    const loader = libraryModule.Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;

    getCurrentUserServerFnMock.mockResolvedValueOnce(null);
    await expect(
      loader({
        location: {
          pathname: "/library",
          search: "",
        },
        serverContext: {},
      }),
    ).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });

    getCurrentUserServerFnMock.mockResolvedValueOnce({ id: "user-1" });
    listLibraryWorksServerFnMock.mockResolvedValueOnce([]);
    const loaderData = await loader({
      location: {
        pathname: "/library",
        search: "",
      },
      serverContext: {},
    });
    vi.spyOn(libraryModule.Route, "useLoaderData").mockReturnValue(loaderData as never);

    expect(renderToStaticMarkup(<libraryModule.LibraryRoute />)).toContain(
      "No works in your library yet.",
    );
  });

  it("redirects unauthenticated library routes to login", async () => {
    const duplicatesModule = await import("./duplicates");
    const settingsModule = await import("./settings");
    const detailModule = await import("./duplicates.$candidateId");
    const workModule = await import("./works.$workId");
    getCurrentUserServerFnMock.mockResolvedValue(null);

    const duplicatesLoader = duplicatesModule.Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const collectionsLoader = (await import("./collections")).Route.options.loader as unknown as (input: {
      serverContext?: unknown;
    }) => Promise<unknown>;
    const collectionDetailLoader = (await import("./collections.$collectionId")).Route.options.loader as unknown as (input: {
      params: { collectionId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const settingsLoader = settingsModule.Route.options.loader as unknown as (input: {
      serverContext?: unknown;
    }) => Promise<unknown>;
    const detailLoader = detailModule.Route.options.loader as unknown as (input: {
      params: { candidateId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const workLoader = workModule.Route.options.loader as unknown as (input: {
      params: { workId: string };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await expect(
      duplicatesLoader({
        location: { pathname: "/duplicates", search: "" },
        serverContext: {},
      }),
    ).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
    await expect(settingsLoader({ serverContext: {} })).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
    await expect(collectionsLoader({ serverContext: {} })).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
    await expect(
      detailLoader({
        params: { candidateId: "candidate-1" },
        serverContext: {},
      }),
    ).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
    await expect(
      collectionDetailLoader({
        params: { collectionId: "collection-1" },
        serverContext: {},
      }),
    ).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
    await expect(
      workLoader({
        params: { workId: "work-1" },
        serverContext: {},
      }),
    ).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
  });

  it("renders root not-found and error boundaries", async () => {
    const rootModule = await import("./__root");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const NotFoundComponent = rootModule.Route.options.notFoundComponent as () => React.ReactElement;
    const ErrorBoundaryComponent = rootModule.Route.options.errorComponent as React.ComponentType<{ error: Error }>;

    const notFoundHtml = renderToStaticMarkup(<NotFoundComponent />);
    const errorHtml = renderToStaticMarkup(<ErrorBoundaryComponent error={new Error("boom")} />);

    expect(notFoundHtml).toContain("Page not found.");
    expect(errorHtml).toContain("Application error");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Root route error", expect.any(Error));

    consoleErrorSpy.mockRestore();
  });
});
