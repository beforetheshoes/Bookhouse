import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressTrackingMode } from "@bookhouse/domain";

const getCurrentUserServerFnMock = vi.fn();
const addWorkToCollectionServerFnMock = vi.fn();
const createCollectionServerFnMock = vi.fn();
const deleteCollectionServerFnMock = vi.fn();
const getCollectionDetailServerFnMock = vi.fn();
const getAudioLinkDetailServerFnMock = vi.fn();
const getDuplicateCandidateDetailServerFnMock = vi.fn();
const getUserProgressTrackingModeServerFnMock = vi.fn();
const getWorkProgressViewServerFnMock = vi.fn();
const listCollectionsServerFnMock = vi.fn();
const listAudioLinksServerFnMock = vi.fn();
const listDuplicateCandidatesServerFnMock = vi.fn();
const mergeDuplicateCandidateServerFnMock = vi.fn();
const removeWorkFromCollectionServerFnMock = vi.fn();
const renameCollectionServerFnMock = vi.fn();
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
  deleteCollectionServerFn: deleteCollectionServerFnMock,
  getCollectionDetailServerFn: getCollectionDetailServerFnMock,
  getAudioLinkDetailServerFn: getAudioLinkDetailServerFnMock,
  getDuplicateCandidateDetailServerFn: getDuplicateCandidateDetailServerFnMock,
  getUserProgressTrackingModeServerFn: getUserProgressTrackingModeServerFnMock,
  getWorkProgressViewServerFn: getWorkProgressViewServerFnMock,
  listCollectionsServerFn: listCollectionsServerFnMock,
  listAudioLinksServerFn: listAudioLinksServerFnMock,
  listDuplicateCandidatesServerFn: listDuplicateCandidatesServerFnMock,
  mergeDuplicateCandidateServerFn: mergeDuplicateCandidateServerFnMock,
  removeWorkFromCollectionServerFn: removeWorkFromCollectionServerFnMock,
  renameCollectionServerFn: renameCollectionServerFnMock,
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
    deleteCollectionServerFnMock.mockReset();
    getCollectionDetailServerFnMock.mockReset();
    getAudioLinkDetailServerFnMock.mockReset();
    getDuplicateCandidateDetailServerFnMock.mockReset();
    getUserProgressTrackingModeServerFnMock.mockReset();
    getWorkProgressViewServerFnMock.mockReset();
    listCollectionsServerFnMock.mockReset();
    listAudioLinksServerFnMock.mockReset();
    listDuplicateCandidatesServerFnMock.mockReset();
    mergeDuplicateCandidateServerFnMock.mockReset();
    removeWorkFromCollectionServerFnMock.mockReset();
    renameCollectionServerFnMock.mockReset();
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

  it("loads audio link detail data and renders the detail page", async () => {
    const { AudioLinkDetailRoute, Route } = await import("./audio-links.$linkId");
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
    const html = renderToStaticMarkup(<AudioLinkDetailRoute />);

    expect(html).toContain("Audio Link audio-link-1");
    expect(html.match(/Open work/g)).toHaveLength(2);
  });

  it("renders empty audio link detail metadata as None", async () => {
    const { AudioLinkDetailRoute, Route } = await import("./audio-links.$linkId");
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
    const html = renderToStaticMarkup(<AudioLinkDetailRoute />);

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

  it("loads duplicate detail data and renders the detail page", async () => {
    const { DuplicateDetailRoute, Route } = await import("./duplicates.$candidateId");
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
    const html = renderToStaticMarkup(<DuplicateDetailRoute />);

    expect(html).toContain("Candidate candidate-1");
  });

  it("renders duplicate detail links when both works are present", async () => {
    const { DuplicateDetailRoute, Route } = await import("./duplicates.$candidateId");
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
    const html = renderToStaticMarkup(<DuplicateDetailRoute />);

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
    const detailHtml = renderToStaticMarkup(<detailModule.DuplicateDetailRoute />);
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
      effectiveMode: ProgressTrackingMode.BY_WORK,
      globalMode: ProgressTrackingMode.BY_WORK,
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
    expect(workHtml).toContain("Override: BY_EDITION");
    expect(workHtml).toContain("Edition edition-1");
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
      effectiveMode: ProgressTrackingMode.BY_WORK,
      globalMode: ProgressTrackingMode.BY_WORK,
      overrideMode: null,
      progressRows: [],
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
    expect(workHtml).not.toContain("Override:");

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
      effectiveMode: ProgressTrackingMode.BY_WORK,
      globalMode: ProgressTrackingMode.BY_EDITION,
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
    expect(workHtml).toContain("EBOOK");
    expect(workHtml).toContain("0%");
    expect(workHtml).toContain("Percent: 0");
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
});
