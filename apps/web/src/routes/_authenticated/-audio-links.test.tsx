// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const invalidateMock = vi.fn();

let mockLoaderData: {
  audioLinks: {
    id: string;
    ebookEdition: { work: { titleDisplay: string }; contributors: { contributor: { nameDisplay: string } }[] };
    audioEdition: { work: { titleDisplay: string }; contributors: { contributor: { nameDisplay: string } }[] };
    matchType: string;
    confidence: number | null;
    reviewStatus: string;
  }[];
} = { audioLinks: [] };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; [key: string]: unknown }) => <a href={to} {...props}>{children}</a>,
    useRouter: () => ({ invalidate: invalidateMock, navigate: vi.fn() }),
    createFileRoute: (_path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

const getAudioLinksServerFnMock = vi.fn();
const confirmAudioLinkServerFnMock = vi.fn();
const ignoreAudioLinkServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/audio-links", () => ({
  getAudioLinksServerFn: getAudioLinksServerFnMock,
  confirmAudioLinkServerFn: confirmAudioLinkServerFnMock,
  ignoreAudioLinkServerFn: ignoreAudioLinkServerFnMock,
}));

vi.mock("~/components/skeletons/table-page-skeleton", () => ({
  TablePageSkeleton: () => <div>Loading...</div>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const makeAudioLink = (overrides: Partial<typeof mockLoaderData.audioLinks[number]> = {}) => ({
  id: "al-1",
  ebookEdition: { work: { titleDisplay: "Ebook Title" }, contributors: [{ contributor: { nameDisplay: "Author Name" } }] },
  audioEdition: { work: { titleDisplay: "Audio Title" }, contributors: [{ contributor: { nameDisplay: "Narrator Name" } }] },
  matchType: "EXACT_METADATA",
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
    const result = await (Route.options.loader as (args: Record<string, unknown>) => Promise<unknown>)({});
    expect(getAudioLinksServerFnMock).toHaveBeenCalled();
    expect(result).toEqual({ audioLinks: [] });
  });

  it("renders 'Audio Links' heading", async () => {
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("Audio Links")).toBeTruthy();
  });

  it("renders empty state when no audio links", async () => {
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("No audio links found")).toBeTruthy();
  });

  it("renders ebook and audio titles in card", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink()] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.getByText("Audio Title")).toBeTruthy();
  });

  it("renders authors for both editions", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink()] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("Author Name")).toBeTruthy();
    expect(screen.getByText("Narrator Name")).toBeTruthy();
  });

  it("renders Confirm and Ignore buttons for PENDING status", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "PENDING" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(screen.getByText("Ignore")).toBeTruthy();
  });

  it("does not render action buttons for CONFIRMED status", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "CONFIRMED" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.queryByText("Confirm")).toBeNull();
    expect(screen.queryByText("Ignore")).toBeNull();
  });

  it("does not render action buttons for IGNORED status", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "IGNORED" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.queryByText("Confirm")).toBeNull();
    expect(screen.queryByText("Ignore")).toBeNull();
  });

  it("renders confidence as percentage", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ confidence: 0.85 })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("85%")).toBeTruthy();
  });

  it("renders confidence as dash when null", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ confidence: null })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders matchType badge", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ matchType: "EXACT_METADATA" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("EXACT_METADATA")).toBeTruthy();
  });

  it("renders status badge with fallback variant for unknown status", async () => {
    mockLoaderData = { audioLinks: [makeAudioLink({ reviewStatus: "UNKNOWN_STATUS" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    expect(screen.getByText("UNKNOWN_STATUS")).toBeTruthy();
  });

  it("tab filtering: PENDING filters to pending only", async () => {
    mockLoaderData = {
      audioLinks: [
        makeAudioLink({ id: "al-1", reviewStatus: "PENDING" }),
        makeAudioLink({ id: "al-2", reviewStatus: "CONFIRMED", ebookEdition: { work: { titleDisplay: "Confirmed Book" }, contributors: [] } }),
      ],
    };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    // Both are visible on "All" tab
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.getByText("Confirmed Book")).toBeTruthy();
    // Click "Pending" tab
    const pendingTab = screen.getByRole("tab", { name: "Pending" });
    await userEvent.click(pendingTab);
    expect(screen.getByText("Ebook Title")).toBeTruthy();
    expect(screen.queryByText("Confirmed Book")).toBeNull();
  });

  it("Confirm button calls confirmAudioLinkServerFn", async () => {
    confirmAudioLinkServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { audioLinks: [makeAudioLink({ id: "al-1", reviewStatus: "PENDING" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await userEvent.click(screen.getByText("Confirm"));
    expect(confirmAudioLinkServerFnMock).toHaveBeenCalledWith({ data: { id: "al-1" } });
  });

  it("Ignore button calls ignoreAudioLinkServerFn", async () => {
    ignoreAudioLinkServerFnMock.mockResolvedValueOnce({ success: true });
    invalidateMock.mockResolvedValueOnce(undefined);
    mockLoaderData = { audioLinks: [makeAudioLink({ id: "al-1", reviewStatus: "PENDING" })] };
    const { Route } = await import("./audio-links");
    const AudioLinksPage = (Route.options.component as React.ComponentType);
    render(<AudioLinksPage />);
    await userEvent.click(screen.getByText("Ignore"));
    expect(ignoreAudioLinkServerFnMock).toHaveBeenCalledWith({ data: { id: "al-1" } });
  });
});
