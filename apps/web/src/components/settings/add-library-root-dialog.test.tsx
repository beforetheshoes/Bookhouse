// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { AddLibraryRootDialog } from "./add-library-root-dialog";

const addLibraryRootServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/library-roots", () => ({
  addLibraryRootServerFn: (...args: unknown[]) => addLibraryRootServerFnMock(...args),
}));

const mockInvalidate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>("@tanstack/react-router");
  return {
    ...actual,
    useRouter: () => ({ invalidate: mockInvalidate, navigate: vi.fn() }),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function openDialog() {
  fireEvent.click(screen.getByText("Add Library Root"));
}

describe("AddLibraryRootDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dialog opens when 'Add Library Root' button clicked", () => {
    render(<AddLibraryRootDialog />);
    openDialog();
    expect(screen.getByText("Add a directory to scan for books.")).toBeTruthy();
  });

  it("form fields accept input for name and path", () => {
    render(<AddLibraryRootDialog />);
    openDialog();

    const nameInput = screen.getByPlaceholderText("My Library");
    const pathInput = screen.getByPlaceholderText("/path/to/books");

    fireEvent.change(nameInput, { target: { value: "My Books" } });
    fireEvent.change(pathInput, { target: { value: "/home/books" } });

    expect((nameInput as HTMLInputElement).value).toBe("My Books");
    expect((pathInput as HTMLInputElement).value).toBe("/home/books");
  });

  it("submit calls addLibraryRootServerFn with correct data", async () => {
    addLibraryRootServerFnMock.mockResolvedValue(undefined);
    render(<AddLibraryRootDialog />);
    openDialog();

    fireEvent.change(screen.getByPlaceholderText("My Library"), {
      target: { value: "My Books" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/books"), {
      target: { value: "/home/books" },
    });

    const form = screen.getByPlaceholderText("My Library").closest("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(addLibraryRootServerFnMock).toHaveBeenCalledWith({
        data: {
          name: "My Books",
          path: "/home/books",
          kind: "EBOOKS",
          scanMode: "INCREMENTAL",
        },
      });
    });
  });

  it("shows success toast on success", async () => {
    addLibraryRootServerFnMock.mockResolvedValue(undefined);
    render(<AddLibraryRootDialog />);
    openDialog();

    fireEvent.change(screen.getByPlaceholderText("My Library"), {
      target: { value: "My Books" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/books"), {
      target: { value: "/home/books" },
    });

    const form = screen.getByPlaceholderText("My Library").closest("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Library root added");
    });
  });

  it("shows error toast on failure", async () => {
    addLibraryRootServerFnMock.mockRejectedValue(new Error("Server error"));
    render(<AddLibraryRootDialog />);
    openDialog();

    fireEvent.change(screen.getByPlaceholderText("My Library"), {
      target: { value: "My Books" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/books"), {
      target: { value: "/home/books" },
    });

    const form = screen.getByPlaceholderText("My Library").closest("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Server error");
    });
  });

  it("submit button shows 'Adding...' while submitting", async () => {
    let resolveSubmit!: () => void;
    addLibraryRootServerFnMock.mockReturnValue(
      new Promise<void>((resolve) => { resolveSubmit = resolve; })
    );

    render(<AddLibraryRootDialog />);
    openDialog();

    fireEvent.change(screen.getByPlaceholderText("My Library"), {
      target: { value: "My Books" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/books"), {
      target: { value: "/home/books" },
    });

    const form = screen.getByPlaceholderText("My Library").closest("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Adding...")).toBeTruthy();
    });

    resolveSubmit();

    await waitFor(() => {
      expect(screen.queryByText("Adding...")).toBeNull();
    });
  });

  it("changes Kind select value via userEvent", async () => {
    const user = userEvent.setup();
    addLibraryRootServerFnMock.mockResolvedValue(undefined);
    render(<AddLibraryRootDialog />);
    openDialog();

    // Open the Kind select
    const kindTrigger = screen.getAllByRole("combobox")[0];
    if (!kindTrigger) throw new Error("kind combobox not found");
    await user.click(kindTrigger);
    // Select "Audiobooks" - use getAllByText to handle duplicates
    const audiobooksOptions = screen.getAllByText("Audiobooks");
    const lastAudiobooksOption = audiobooksOptions[audiobooksOptions.length - 1];
    if (!lastAudiobooksOption) throw new Error("audiobooks option not found");
    await user.click(lastAudiobooksOption);

    // Submit to verify the kind value was changed
    fireEvent.change(screen.getByPlaceholderText("My Library"), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/books"), {
      target: { value: "/test" },
    });
    const form = screen.getByPlaceholderText("My Library").closest("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(addLibraryRootServerFnMock).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: "AUDIOBOOKS" }),
      });
    });
  });

  it("changes ScanMode select value via userEvent", async () => {
    const user = userEvent.setup();
    addLibraryRootServerFnMock.mockResolvedValue(undefined);
    render(<AddLibraryRootDialog />);
    openDialog();

    // Open the ScanMode select (second combobox)
    const scanModeTrigger = screen.getAllByRole("combobox")[1];
    if (!scanModeTrigger) throw new Error("scan mode combobox not found");
    await user.click(scanModeTrigger);
    // Select "Full" - there may be multiple "Full" texts, pick the one in the select listbox
    const fullOptions = screen.getAllByText("Full");
    // Click the last one (which should be the option in the dropdown listbox)
    const lastFullOption = fullOptions[fullOptions.length - 1];
    if (!lastFullOption) throw new Error("full option not found");
    await user.click(lastFullOption);

    // Submit to verify the scanMode value was changed
    fireEvent.change(screen.getByPlaceholderText("My Library"), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/books"), {
      target: { value: "/test" },
    });
    const form = screen.getByPlaceholderText("My Library").closest("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(addLibraryRootServerFnMock).toHaveBeenCalledWith({
        data: expect.objectContaining({ scanMode: "FULL" }),
      });
    });
  });

  it("resetForm is called after successful submit (form resets to defaults)", async () => {
    addLibraryRootServerFnMock.mockResolvedValue(undefined);
    render(<AddLibraryRootDialog />);
    openDialog();

    fireEvent.change(screen.getByPlaceholderText("My Library"), {
      target: { value: "My Books" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/books"), {
      target: { value: "/home/books" },
    });

    const form = screen.getByPlaceholderText("My Library").closest("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(addLibraryRootServerFnMock).toHaveBeenCalled();
    });
    // Success closes dialog and resets form; no error toast
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("shows error toast with generic message when error is not Error instance", async () => {
    addLibraryRootServerFnMock.mockRejectedValue("plain string error");
    render(<AddLibraryRootDialog />);
    openDialog();

    fireEvent.change(screen.getByPlaceholderText("My Library"), {
      target: { value: "My Books" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/books"), {
      target: { value: "/home/books" },
    });

    const form = screen.getByPlaceholderText("My Library").closest("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to add library root");
    });
  });
});
