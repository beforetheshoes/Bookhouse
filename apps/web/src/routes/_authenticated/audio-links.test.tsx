// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: any = { audioLinks: [] };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: any) => ({
      ...opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const getAudioLinksServerFnMock = vi.fn();
vi.mock("~/lib/server-fns/audio-links", () => ({
  getAudioLinksServerFn: (...args: any[]) => getAudioLinksServerFnMock(...args),
}));

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
}));

// Use real DataTable so column cell renderers execute
vi.mock("~/components/data-table", async () => {
  const actual = await vi.importActual<typeof import("~/components/data-table")>("~/components/data-table");
  return actual;
});

const makeAudioLink = (overrides: Partial<{
  confidence: number | null;
  reviewStatus: string;
  matchType: string;
}> = {}) => ({
  ebookEdition: { work: { titleDisplay: "Ebook Title" } },
  audioEdition: { work: { titleDisplay: "Audio Title" } },
  matchType: "ISBN",
  confidence: null,
  reviewStatus: "PENDING",
  ...overrides,
});

describe("AudioLinksPage", () => {
  beforeEach(() => {
    mockLoaderData = { audioLinks: [] };
    vi.clearAllMocks();
  });

  it("loader calls getAudioLinksServerFn", async () => {
    getAudioLinksServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./audio-links");
    const result = await Route.loader!({} as any);
    expect(getAudioLinksServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ audioLinks: [] });
  });

  it("renders 'Audio Links' heading", async () => {
    const { Route } = await import("./audio-links");
    const AudioLinksPage = Route.component!;
    render(<AudioLinksPage />);
    expect(screen.getByText("Audio Links")).toBeTruthy();
  });

  it("renders confidence as '—' when null", async () => {
    mockLoaderData = {
      audioLinks: [makeAudioLink({ confidence: null })],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = Route.component!;
    render(<AudioLinksPage />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders confidence as percentage when number", async () => {
    mockLoaderData = {
      audioLinks: [makeAudioLink({ confidence: 0.85 })],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = Route.component!;
    render(<AudioLinksPage />);
    expect(screen.getByText("85%")).toBeTruthy();
  });

  it("renders PENDING status badge", async () => {
    mockLoaderData = {
      audioLinks: [makeAudioLink({ reviewStatus: "PENDING" })],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = Route.component!;
    render(<AudioLinksPage />);
    expect(screen.getByText("PENDING")).toBeTruthy();
  });

  it("renders CONFIRMED status badge", async () => {
    mockLoaderData = {
      audioLinks: [makeAudioLink({ reviewStatus: "CONFIRMED" })],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = Route.component!;
    render(<AudioLinksPage />);
    expect(screen.getByText("CONFIRMED")).toBeTruthy();
  });

  it("renders unknown status badge with fallback 'outline' variant", async () => {
    mockLoaderData = {
      audioLinks: [makeAudioLink({ reviewStatus: "UNKNOWN_STATUS" })],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = Route.component!;
    render(<AudioLinksPage />);
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });
});
