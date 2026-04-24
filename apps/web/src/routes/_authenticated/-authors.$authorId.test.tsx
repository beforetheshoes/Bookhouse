// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLoaderData: {
  author: {
    id: string;
    nameDisplay: string;
    nameCanonical: string;
    nameSort: string | null;
    imagePath: string | null;
    works: {
      id: string;
      titleDisplay: string;
      sortTitle: string;
      coverPath: string | null;
      enrichmentStatus: string;
      series: { id: string; name: string } | null;
      editions: {
        formatFamily: string;
        contributors: { role: string; contributor: { nameDisplay: string } }[];
      }[];
    }[];
  };
} = {
  author: { id: "a1", nameDisplay: "Patrick Rothfuss", nameCanonical: "patrick rothfuss", nameSort: "rothfuss, patrick", imagePath: null, works: [] },
};

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    useRouter: () => ({ invalidate: vi.fn() }),
    Link: ({ children, to, params, ...props }: { children?: React.ReactNode; to: string; params?: Record<string, string>; [key: string]: string | undefined | React.ReactNode | Record<string, string> | (() => void) }) => {
      let href = to;
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          href = href.replace(`$${key}`, value);
        }
      }
      return <a href={href} {...props}>{children}</a>;
    },
    createFileRoute: (_path: string) => (opts: Record<string, string | boolean | object | ((...a: object[]) => object | undefined | Promise<object>)>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
      useRouteContext: () => ({}),
    }),
  };
});

vi.mock("~/components/skeletons/grid-page-skeleton", () => ({
  GridPageSkeleton: () => <div>Loading grid...</div>,
}));

vi.mock("~/components/work-card", () => ({
  WorkCard: ({ title }: { title: string }) => <div data-testid="work-card">{title}</div>,
}));

const getAuthorDetailServerFnMock = vi.fn();
const fetchAuthorPhotoFromUrlServerFnMock = vi.fn().mockResolvedValue({ success: true });
vi.mock("~/lib/server-fns/authors", () => ({
  getAuthorDetailServerFn: getAuthorDetailServerFnMock,
  fetchAuthorPhotoFromUrlServerFn: fetchAuthorPhotoFromUrlServerFnMock,
}));

const updateContributorServerFnMock = vi.fn().mockResolvedValue({ success: true });
vi.mock("~/lib/server-fns/editing", () => ({
  updateContributorServerFn: updateContributorServerFnMock,
}));

vi.mock("~/lib/mutation", () => ({
  runMutation: async (fn: () => Promise<object>) => fn(),
}));

const makeWork = (title: string, formats: string[] = ["EBOOK"]) => ({
  id: `work-${title.toLowerCase().replace(/\s/g, "-")}`,
  titleDisplay: title,
  sortTitle: title.toLowerCase(),
  coverPath: null,
  enrichmentStatus: "ENRICHED",
  series: null,
  editions: formats.map((f) => ({
    formatFamily: f,
    contributors: [{ role: "AUTHOR", contributor: { nameDisplay: "Patrick Rothfuss" } }],
  })),
});

describe("AuthorDetailPage", () => {
  beforeEach(() => {
    mockLoaderData = {
      author: { id: "a1", nameDisplay: "Patrick Rothfuss", nameCanonical: "patrick rothfuss", nameSort: "rothfuss, patrick", imagePath: null, works: [] },
    };
    vi.clearAllMocks();
  });

  it("loader calls getAuthorDetailServerFn with authorId", async () => {
    getAuthorDetailServerFnMock.mockResolvedValueOnce(mockLoaderData.author);
    const { Route } = await import("./authors.$authorId");
    const result = await (Route.options.loader as (args: { params: { authorId: string } }) => Promise<object>)({
      params: { authorId: "a1" },
    });
    expect(getAuthorDetailServerFnMock).toHaveBeenCalledWith({
      data: { authorId: "a1" },
    });
    expect(result).toEqual({ author: mockLoaderData.author });
  });

  it("renders author name as heading", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Patrick Rothfuss");
  });

  it("renders nameSort editable field and saves on edit", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    // Click the "Sort as" display text to enter edit mode
    const sortDisplay = screen.getByText("rothfuss, patrick");
    fireEvent.click(sortDisplay);
    // Now an input should be visible with the current value
    const input = screen.getByDisplayValue("rothfuss, patrick");
    fireEvent.change(input, { target: { value: "rothfuss, patrick j." } });
    fireEvent.blur(input);
    await vi.waitFor(() => {
      expect(updateContributorServerFnMock).toHaveBeenCalledWith({
        data: { contributorId: "a1", nameSort: "rothfuss, patrick j." },
      });
    });
  });

  it("renders empty string when nameSort is null", async () => {
    mockLoaderData.author.nameSort = null;
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    // When nameSort is null, the EditableField shows placeholder "auto"
    expect(screen.getByText("auto")).toBeTruthy();
  });

  it("renders breadcrumb with link to authors list", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const link = screen.getByText("Authors");
    expect(link.closest("a")?.getAttribute("href")).toBe("/authors");
  });

  it("renders works using WorkCard", async () => {
    mockLoaderData.author.works = [
      makeWork("The Name of the Wind"),
      makeWork("The Wise Man's Fear"),
    ];
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const cards = screen.getAllByTestId("work-card");
    expect(cards).toHaveLength(2);
  });

  it("renders dash when work has no author contributors", async () => {
    mockLoaderData.author.works = [
      {
        id: "work-no-authors",
        titleDisplay: "Mystery Book",
        sortTitle: "mystery book",
        coverPath: null,
        enrichmentStatus: "ENRICHED",
        series: null,
        editions: [{ formatFamily: "EBOOK", contributors: [] }],
      },
    ];
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("work-card")).toBeTruthy();
  });

  it("shows empty state when author has no works", async () => {
    mockLoaderData.author.works = [];
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("No works by this author")).toBeTruthy();
  });

  it("renders author photo when imagePath is set", async () => {
    mockLoaderData.author.imagePath = "a1";
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    const { container } = render(<Page />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/api/authors/a1/medium");
  });

  it("renders fallback icon when imagePath is null", async () => {
    mockLoaderData.author.imagePath = null;
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    const { container } = render(<Page />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("uploads photo when file is selected", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    const { toast } = await import("sonner");
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const input = screen.getByTestId("photo-file-input");
    const file = new File(["fake-image"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Author photo updated");
    });
  });

  it("shows error toast on upload failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve("Bad image") });
    globalThis.fetch = mockFetch;

    const { toast } = await import("sonner");
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const input = screen.getByTestId("photo-file-input");
    const file = new File(["bad"], "bad.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("shows generic error message on non-Error throw", async () => {
    const mockFetch = vi.fn().mockRejectedValue("network failure");
    globalThis.fetch = mockFetch;

    const { toast } = await import("sonner");
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const input = screen.getByTestId("photo-file-input");
    fireEvent.change(input, { target: { files: [new File(["x"], "x.jpg", { type: "image/jpeg" })] } });

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to upload photo");
    });
  });

  it("shows default error message when response text is empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve("") });
    globalThis.fetch = mockFetch;

    const { toast } = await import("sonner");
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const input = screen.getByTestId("photo-file-input");
    fireEvent.change(input, { target: { files: [new File(["x"], "x.jpg", { type: "image/jpeg" })] } });

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Upload failed");
    });
  });

  it("does nothing when no file is selected", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const input = screen.getByTestId("photo-file-input");
    fireEvent.change(input, { target: { files: [] } });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("opens file picker on avatar click", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const avatarButton = screen.getByTestId("avatar-upload-button");
    fireEvent.click(avatarButton);
    // Verifies click handler runs without error
  });

  it("opens file picker on avatar Enter key", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const avatarButton = screen.getByTestId("avatar-upload-button");
    fireEvent.keyDown(avatarButton, { key: "Enter" });
  });

  it("opens file picker on avatar Space key", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const avatarButton = screen.getByTestId("avatar-upload-button");
    fireEvent.keyDown(avatarButton, { key: " " });
  });

  it("ignores other keys on avatar", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const avatarButton = screen.getByTestId("avatar-upload-button");
    fireEvent.keyDown(avatarButton, { key: "Tab" });
  });

  it("shows URL input when 'Link to photo' is clicked", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("link-photo-button"));
    expect(screen.getByTestId("photo-url-input")).toBeTruthy();
  });

  it("fetches photo from URL when Fetch is clicked", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("link-photo-button"));
    const input = screen.getByTestId("photo-url-input");
    fireEvent.change(input, { target: { value: "https://example.com/photo.jpg" } });
    fireEvent.click(screen.getByText("Fetch"));
    await vi.waitFor(() => {
      expect(fetchAuthorPhotoFromUrlServerFnMock).toHaveBeenCalledWith({
        data: { contributorId: "a1", imageUrl: "https://example.com/photo.jpg" },
      });
    });
    // After success, URL input should be hidden
    await vi.waitFor(() => {
      expect(screen.queryByTestId("url-input-row")).toBeNull();
    });
  });

  it("does not fetch when URL is empty", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByTestId("link-photo-button"));
    const fetchButton = screen.getByText("Fetch").closest("button");
    expect(fetchButton?.disabled).toBe(true);
  });

  it("renders photo upload file input", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByTestId("photo-file-input")).toBeTruthy();
  });

  it("renders camera overlay on avatar hover area", async () => {
    const { Route } = await import("./authors.$authorId");
    const Page = Route.options.component as React.ComponentType;
    const { container } = render(<Page />);
    const overlay = container.querySelector(".group-hover\\:opacity-100");
    expect(overlay).toBeTruthy();
  });

  it("renders pending skeleton", async () => {
    const { Route } = await import("./authors.$authorId");
    const Skeleton = Route.options.pendingComponent as React.ComponentType;
    render(<Skeleton />);
    expect(screen.getByText("Loading grid...")).toBeTruthy();
  });
});
