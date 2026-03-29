// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackupTab } from "./backup-tab";
import type { BackupManifest } from "~/lib/backup/manifest";

// Mock sonner toast
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

// Mock fetch globally
const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

// Mock URL.createObjectURL / revokeObjectURL
globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
globalThis.URL.revokeObjectURL = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
});

const HISTORY: BackupManifest[] = [
  {
    version: 1,
    timestamp: "2026-03-28T12:00:00.000Z",
    databaseSize: 1048576,
    coverCount: 42,
    coverSize: 5242880,
  },
  {
    version: 1,
    timestamp: "2026-03-27T08:00:00.000Z",
    databaseSize: 1024000,
    coverCount: 40,
    coverSize: 5120000,
  },
];

const MANIFEST: BackupManifest = {
  version: 1,
  timestamp: "2026-03-28T14:00:00.000Z",
  databaseSize: 2000,
  coverCount: 10,
  coverSize: 5000,
};

function mockSuccessfulBackup(manifest: BackupManifest = MANIFEST) {
  fetchMock.mockResolvedValue({
    ok: true,
    headers: {
      get: (name: string) => name === "x-backup-manifest" ? JSON.stringify(manifest) : null,
    },
    blob: () => Promise.resolve(new Blob(["data"])),
  });
}

function mockFailedBackup() {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 500,
    headers: { get: () => null },
    blob: () => Promise.resolve(new Blob()),
  });
}

function mockSuccessfulRestore() {
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });
}

function mockFailedRestore(errorText: string) {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 400,
    text: () => Promise.resolve(errorText),
  });
}

describe("BackupTab", () => {
  // --- Rendering ---

  it("renders Create Backup button", () => {
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /create backup/i })).toBeTruthy();
  });

  it("renders Restore section with file input", () => {
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);
    expect(screen.getByText(/restore from backup/i)).toBeTruthy();
  });

  it("shows empty state when no backup history", () => {
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);
    expect(screen.getByText(/no backups yet/i)).toBeTruthy();
  });

  it("renders backup history entries", () => {
    render(<BackupTab history={HISTORY} onBackupComplete={vi.fn()} />);
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });

  it("formats database size in MB", () => {
    render(<BackupTab history={HISTORY} onBackupComplete={vi.fn()} />);
    expect(screen.getByText("1.0 MB")).toBeTruthy();
  });

  it("formats cover size in MB", () => {
    render(<BackupTab history={HISTORY} onBackupComplete={vi.fn()} />);
    expect(screen.getByText("5.0 MB")).toBeTruthy();
  });

  it("formats small sizes in bytes", () => {
    const small: BackupManifest[] = [{
      ...MANIFEST,
      databaseSize: 512,
      coverSize: 768,
    }];
    render(<BackupTab history={small} onBackupComplete={vi.fn()} />);
    expect(screen.getByText("512 B")).toBeTruthy();
    expect(screen.getByText("768 B")).toBeTruthy();
  });

  it("formats sizes in KB", () => {
    const kb: BackupManifest[] = [{
      ...MANIFEST,
      databaseSize: 2048,
      coverSize: 3072,
    }];
    render(<BackupTab history={kb} onBackupComplete={vi.fn()} />);
    expect(screen.getByText("2.0 KB")).toBeTruthy();
    expect(screen.getByText("3.0 KB")).toBeTruthy();
  });

  it("formats sizes in GB", () => {
    const gb: BackupManifest[] = [{
      ...MANIFEST,
      databaseSize: 2 * 1024 * 1024 * 1024,
      coverSize: 3 * 1024 * 1024 * 1024,
    }];
    render(<BackupTab history={gb} onBackupComplete={vi.fn()} />);
    expect(screen.getByText("2.0 GB")).toBeTruthy();
    expect(screen.getByText("3.0 GB")).toBeTruthy();
  });

  // --- Create Backup ---

  it("disables Create Backup button while loading", async () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    const btn: HTMLButtonElement = screen.getByRole("button", { name: /creating/i });
    expect(btn.disabled).toBe(true);
  });

  it("calls fetch with download endpoint on backup", async () => {
    mockSuccessfulBackup();
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/backup/download");
  });

  it("calls onBackupComplete with manifest after successful backup", async () => {
    mockSuccessfulBackup(MANIFEST);
    const onBackupComplete = vi.fn();
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={onBackupComplete} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    await waitFor(() => {
      expect(onBackupComplete).toHaveBeenCalledWith(MANIFEST);
    });
  });

  it("shows success toast after backup", async () => {
    mockSuccessfulBackup();
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Backup created successfully");
    });
  });

  it("does not call onBackupComplete when manifest header is missing", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      blob: () => Promise.resolve(new Blob(["data"])),
    });
    const onBackupComplete = vi.fn();
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={onBackupComplete} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
    });
    expect(onBackupComplete).not.toHaveBeenCalled();
  });

  it("does not call onBackupComplete when manifest header is invalid JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => "not-json" },
      blob: () => Promise.resolve(new Blob(["data"])),
    });
    const onBackupComplete = vi.fn();
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={onBackupComplete} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
    });
    expect(onBackupComplete).not.toHaveBeenCalled();
  });

  it("shows error toast when backup fails (non-ok response)", async () => {
    mockFailedBackup();
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Backup failed");
    });
  });

  it("shows error toast when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Network error");
    });
  });

  it("shows fallback error toast when fetch throws non-Error", async () => {
    fetchMock.mockRejectedValue("string-error");
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Backup failed");
    });
  });

  it("re-enables Create Backup button after success", async () => {
    mockSuccessfulBackup();
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create backup/i }));

    await waitFor(() => {
      const btn: HTMLButtonElement = screen.getByRole("button", { name: /create backup/i });
      expect(btn.disabled).toBe(false);
    });
  });

  // --- Restore ---

  it("shows restore confirmation dialog when file selected", async () => {
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    const file = new File(["archive"], "backup.tar.gz", { type: "application/gzip" });
    await user.upload(input, file);

    expect(screen.getByText(/overwrite all current data/i)).toBeTruthy();
  });

  it("closes dialog and clears file when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    const file = new File(["archive"], "backup.tar.gz", { type: "application/gzip" });
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText(/overwrite all current data/i)).toBeNull();
  });

  it("calls fetch with upload endpoint on restore confirm", async () => {
    mockSuccessfulRestore();
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    const file = new File(["archive"], "backup.tar.gz", { type: "application/gzip" });
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/backup/upload", expect.objectContaining({
        method: "POST",
      }));
    });
  });

  it("shows success toast after restore", async () => {
    mockSuccessfulRestore();
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    const file = new File(["archive"], "backup.tar.gz", { type: "application/gzip" });
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Backup restored successfully. Reloading...");
    });
  });

  it("shows error toast when restore fails", async () => {
    mockFailedRestore("Invalid archive");
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    const file = new File(["archive"], "backup.tar.gz", { type: "application/gzip" });
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Invalid archive");
    });
  });

  it("shows fallback error when restore fails with empty text", async () => {
    mockFailedRestore("");
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    const file = new File(["archive"], "backup.tar.gz", { type: "application/gzip" });
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Restore failed");
    });
  });

  it("shows restoring indicator during restore", async () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    const file = new File(["archive"], "backup.tar.gz", { type: "application/gzip" });
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    expect(screen.getByText(/restoring backup/i)).toBeTruthy();
  });

  it("renders formatted dates in history table", () => {
    render(<BackupTab history={HISTORY} onBackupComplete={vi.fn()} />);
    // formatDate output depends on locale, so just check dates render something
    const rows = screen.getAllByRole("row");
    // header + 2 data rows
    expect(rows.length).toBe(3);
  });

  it("shows error toast when restore fetch throws non-Error", async () => {
    fetchMock.mockRejectedValue("not-an-error");
    const user = userEvent.setup();
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    const file = new File(["archive"], "backup.tar.gz", { type: "application/gzip" });
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Restore failed");
    });
  });

  it("handles reload timeout after successful restore", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
    });

    mockSuccessfulRestore();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    const file = new File(["archive"], "backup.tar.gz", { type: "application/gzip" });
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
    });

    vi.advanceTimersByTime(1500);
    expect(reloadMock).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not open dialog when file input change has no files", () => {
    render(<BackupTab history={[]} onBackupComplete={vi.fn()} />);

    const input: HTMLInputElement = screen.getByTestId("restore-file-input");
    // Fire change event without files
    Object.defineProperty(input, "files", { value: [] });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(screen.queryByText(/overwrite all current data/i)).toBeNull();
  });
});
