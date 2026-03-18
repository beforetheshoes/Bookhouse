import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProgressTrackingMode } from "@bookhouse/domain";

const getCurrentUserServerFnMock = vi.fn();
const getDuplicateCandidateDetailServerFnMock = vi.fn();
const getUserProgressTrackingModeServerFnMock = vi.fn();
const getWorkProgressViewServerFnMock = vi.fn();
const listDuplicateCandidatesServerFnMock = vi.fn();
const mergeDuplicateCandidateServerFnMock = vi.fn();
const updateDuplicateCandidateStatusServerFnMock = vi.fn();
const updateUserProgressTrackingModeServerFnMock = vi.fn();
const updateWorkProgressTrackingModeServerFnMock = vi.fn();
const useServerFnMock = vi.fn((fn) => fn);

vi.mock("../lib/auth-client", () => ({
  getCurrentUserServerFn: getCurrentUserServerFnMock,
}));

vi.mock("../lib/library-server", () => ({
  getDuplicateCandidateDetailServerFn: getDuplicateCandidateDetailServerFnMock,
  getUserProgressTrackingModeServerFn: getUserProgressTrackingModeServerFnMock,
  getWorkProgressViewServerFn: getWorkProgressViewServerFnMock,
  listDuplicateCandidatesServerFn: listDuplicateCandidatesServerFnMock,
  mergeDuplicateCandidateServerFn: mergeDuplicateCandidateServerFnMock,
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
  });

  it("renders work pages without override or summary and throws when entities are missing", async () => {
    const workModule = await import("./works.$workId");
    const detailModule = await import("./duplicates.$candidateId");
    getCurrentUserServerFnMock.mockResolvedValue({ id: "user-1" });
    getWorkProgressViewServerFnMock.mockResolvedValueOnce({
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
