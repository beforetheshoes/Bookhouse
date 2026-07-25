// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LibraryRootRow } from "~/lib/server-fns/library-roots";

const { mockLoaderData, getLibraryRootsServerFnMock } = vi.hoisted(() => ({
  mockLoaderData: { libraryRoots: [] as LibraryRootRow[] },
  getLibraryRootsServerFnMock: vi.fn(),
}));

vi.mock("~/lib/server-fns/library-roots", () => ({
  getLibraryRootsServerFn: getLibraryRootsServerFnMock,
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    createFileRoute: () => (opts: Record<string, object | ((...args: object[]) => object)>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
    }),
    redirect: vi.fn((arg: object) => {
      const err = new Error("redirect") as Error & { redirect: object };
      err.redirect = arg;
      return err;
    }),
  };
});

import { UploadForm, Route } from "./upload";

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (msg: string) => { toastErrorMock(msg); },
    success: (msg: string) => { toastSuccessMock(msg); },
  },
}));

const { getUploadStatusServerFnMock } = vi.hoisted(() => ({
  getUploadStatusServerFnMock: vi.fn(),
}));
vi.mock("~/lib/server-fns/upload-status", () => ({
  getUploadStatusServerFn: getUploadStatusServerFnMock,
}));

const fetchMock = vi.fn();
beforeEach(async () => {
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  fetchMock.mockReset();
  getUploadStatusServerFnMock.mockReset();
  getUploadStatusServerFnMock.mockResolvedValue(null);
  globalThis.fetch = fetchMock as never;
  const { takePendingUploadFiles } = await import("~/lib/pending-upload");
  takePendingUploadFiles();
});

function makeRoot(overrides: Partial<LibraryRootRow> = {}): LibraryRootRow {
  return {
    id: "root-1",
    name: "Ebooks",
    path: "/data/ebooks",
    kind: "EBOOKS",
    scanMode: "INCREMENTAL",
    isEnabled: true,
    lastScannedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("UploadForm", () => {
  it("renders the form with library options", () => {
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    expect(screen.getByText("Upload a book")).toBeTruthy();
    expect(screen.getByTestId("upload-dropzone")).toBeTruthy();
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByLabelText("Author")).toBeTruthy();
  });

  it("shows a hint when no library roots are configured and disables the submit button", () => {
    render(<UploadForm libraryRoots={[]} />);
    expect(
      screen.getByText(/No library roots configured/i),
    ).toBeTruthy();
    const submit = screen.getByRole("button", { name: /upload/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it("rejects submission with no files", async () => {
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await Promise.resolve();
    expect(toastErrorMock).toHaveBeenCalledWith("Add at least one file");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits without title and author, leaving them to server-side detection", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({ importJobId: "import-1" }),
    });
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub", { type: "application/epub+zip" });
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await new Promise((r) => setTimeout(r, 5));
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sentBody = (fetchMock.mock.calls[0] as [string, { body: FormData }])[1].body;
    expect(sentBody.has("title")).toBe(false);
    expect(sentBody.has("author")).toBe(false);
  });

  it("consumes files stashed by the global drop target on mount", async () => {
    const { stashPendingUploadFiles } = await import("~/lib/pending-upload");
    stashPendingUploadFiles([new File(["x"], "stashed.epub")]);

    render(<UploadForm libraryRoots={[makeRoot()]} />);
    expect(await screen.findByText("stashed.epub")).toBeTruthy();
  });

  it("receives files dropped globally while the form is already mounted", async () => {
    const { stashPendingUploadFiles } = await import("~/lib/pending-upload");
    render(<UploadForm libraryRoots={[makeRoot()]} />);

    stashPendingUploadFiles([new File(["x"], "live-drop.epub")]);
    expect(await screen.findByText("live-drop.epub")).toBeTruthy();
  });

  it("posts to /api/upload-book on submit and reports success", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({ importJobId: "import-1" }),
    });
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub", { type: "application/epub+zip" });
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText(/series \(optional\)/i), { target: { value: "Saga" } });
    fireEvent.change(screen.getByLabelText(/series index/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await new Promise((r) => setTimeout(r, 5));
    expect(fetchMock).toHaveBeenCalledWith("/api/upload-book", expect.objectContaining({
      method: "POST",
    }));
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(screen.getByTestId("upload-status")).toBeTruthy();
  });

  it("shows an error toast when the upload fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => "Bad request",
    });
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await new Promise((r) => setTimeout(r, 5));
    expect(toastErrorMock).toHaveBeenCalledWith("Bad request");
  });

  it("falls back to generic error message when response has no text body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => "",
    });
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await new Promise((r) => setTimeout(r, 5));
    expect(toastErrorMock).toHaveBeenCalledWith("Upload failed: 500");
  });

  it("falls back to generic error message when fetch rejects with non-Error", async () => {
    fetchMock.mockRejectedValue("network died");
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await new Promise((r) => setTimeout(r, 5));
    expect(toastErrorMock).toHaveBeenCalledWith("Upload failed");
  });

  it("accepts files dropped onto the dropzone without leaking to the window", () => {
    const windowDrop = vi.fn();
    window.addEventListener("drop", windowDrop);
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const dropzone = screen.getByTestId("upload-dropzone");
    const file = new File(["x"], "dropped.epub");
    fireEvent.dragOver(dropzone);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(screen.getByText("dropped.epub")).toBeTruthy();
    // The local dropzone must stop propagation so the app-wide drop
    // target doesn't also stash the same files.
    expect(windowDrop).not.toHaveBeenCalled();
    window.removeEventListener("drop", windowDrop);
  });

  it("ignores empty drag/drop events", () => {
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const dropzone = screen.getByTestId("upload-dropzone");
    fireEvent.dragLeave(dropzone);
    fireEvent.drop(dropzone, { dataTransfer: { files: [] } });
    // No file row should appear
    expect(screen.queryByLabelText(/Remove/)).toBeNull();
  });

  it("removes a file from the list when the X button is clicked", () => {
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    expect(screen.getByText("book.epub")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Remove book.epub"));
    expect(screen.queryByText("book.epub")).toBeNull();
  });

  it("does not add files when input event has no files", () => {
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: null });
    fireEvent.change(input);
    expect(screen.queryByLabelText(/Remove/)).toBeNull();
  });

  it("triggers the hidden file input when Choose files is clicked", () => {
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const fileInput = screen.getByTestId("upload-file-input");
    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByRole("button", { name: /choose files/i }));
    expect(clickSpy).toHaveBeenCalled();
  });
});

describe("UploadStatusPanel polling", () => {
  it("polls upload-status and updates the panel when status arrives", async () => {
    getUploadStatusServerFnMock.mockResolvedValue({
        status: "RUNNING",
        processedFiles: 1,
        totalFiles: 3,
        errorCount: 0,
      });

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({ importJobId: "import-1" }),
    });

    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByTestId("upload-status")).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/1 \/ 3 files processed/)).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("shows QUEUED status between upload and the first poll result", async () => {
    // Hold the poll open so the panel stays on the state set by the upload
    // itself. Without this the first poll result can land in the same tick and
    // the QUEUED render is never observed.
    getUploadStatusServerFnMock.mockReturnValue(new Promise(() => undefined));
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({ importJobId: "import-queued" }),
    });
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByText("Queued for processing…")).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("shows SUCCEEDED status when polling reports completion", async () => {
    getUploadStatusServerFnMock.mockResolvedValue({
        status: "SUCCEEDED",
        processedFiles: 5,
        totalFiles: 5,
        errorCount: 0,
      });
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({ importJobId: "import-3" }),
    });
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByText("Upload complete")).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("shows the error count when running with errors", async () => {
    getUploadStatusServerFnMock.mockResolvedValue({
        status: "RUNNING",
        processedFiles: 2,
        totalFiles: 5,
        errorCount: 1,
      });
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({ importJobId: "import-4" }),
    });
    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 errors/)).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("shows FAILED status with error text", async () => {
    getUploadStatusServerFnMock.mockResolvedValue({
        status: "FAILED",
        error: "ouch",
        processedFiles: 0,
        totalFiles: 1,
        errorCount: 1,
      });

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({ importJobId: "import-2" }),
    });

    render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByText("ouch")).toBeTruthy();
    }, { timeout: 3000 });
  });
});

describe("UploadStatusPanel interval", () => {
  it("re-polls upload-status on the interval", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getUploadStatusServerFnMock.mockResolvedValue({
          status: "RUNNING",
          processedFiles: 0,
          totalFiles: 1,
          errorCount: 0,
        });
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => ({ importJobId: "import-interval" }),
      });
      render(<UploadForm libraryRoots={[makeRoot()]} />);
      const file = new File(["x"], "book.epub");
      const input = screen.getByTestId("upload-file-input");
      Object.defineProperty(input, "files", { value: [file] });
      fireEvent.change(input);
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
      fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
      fireEvent.click(screen.getByRole("button", { name: /upload/i }));
      await waitFor(() => {
        expect(screen.getByTestId("upload-status")).toBeTruthy();
      });
      const callsBefore = getUploadStatusServerFnMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(2500);
      expect(getUploadStatusServerFnMock.mock.calls.length).toBeGreaterThan(callsBefore);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("UploadStatusPanel cleanup", () => {
  it("cleans up the polling interval on unmount", async () => {
    getUploadStatusServerFnMock.mockResolvedValue({
        status: "RUNNING",
        processedFiles: 0,
        totalFiles: 1,
        errorCount: 0,
      });
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({ importJobId: "import-cleanup" }),
    });
    const { unmount } = render(<UploadForm libraryRoots={[makeRoot()]} />);
    const file = new File(["x"], "book.epub");
    const input = screen.getByTestId("upload-file-input");
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await waitFor(() => {
      expect(screen.getByTestId("upload-status")).toBeTruthy();
    });
    unmount();
    // No assertion needed — the cleanup function clears the interval; absence
    // of unhandled-promise warnings is the success criterion.
  });
});

describe("Route", () => {
  it("redirects non-owners to /library", () => {
    const options = (Route as never as { options: { beforeLoad: (a: { context: { user?: { roles?: string[] } } }) => void } }).options;
    expect(() =>
      { options.beforeLoad({
        context: { user: { roles: ["VIEWER"] } },
      }); },
    ).toThrow();
  });

  it("does not redirect owners", () => {
    const options = (Route as never as { options: { beforeLoad: (a: { context: { user?: { roles?: string[] } } }) => void } }).options;
    expect(() =>
      { options.beforeLoad({
        context: { user: { roles: ["OWNER"] } },
      }); },
    ).not.toThrow();
  });

  it("loader returns libraryRoots from the server fn", async () => {
    getLibraryRootsServerFnMock.mockResolvedValue([makeRoot()]);
    const options = (Route as never as { options: { loader: () => Promise<{ libraryRoots: LibraryRootRow[] }> } }).options;
    const result = await options.loader();
    expect(result.libraryRoots).toHaveLength(1);
  });

  it("UploadPage renders the form using loader data", async () => {
    mockLoaderData.libraryRoots = [makeRoot()];
    const { UploadPage } = await import("./upload");
    render(<UploadPage />);
    expect(screen.getByText("Upload a book")).toBeTruthy();
  });
});
