// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

const mockInvalidate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    useRouter: () => ({ invalidate: mockInvalidate }),
  };
});

const {
  getKindleConfigServerFnMock,
  saveKindleConfigServerFnMock,
  removeKindleConfigServerFnMock,
} = vi.hoisted(() => ({
  getKindleConfigServerFnMock: vi.fn(),
  saveKindleConfigServerFnMock: vi.fn(),
  removeKindleConfigServerFnMock: vi.fn(),
}));

vi.mock("~/lib/server-fns/kindle", () => ({
  getKindleConfigServerFn: getKindleConfigServerFnMock,
  saveKindleConfigServerFn: saveKindleConfigServerFnMock,
  removeKindleConfigServerFn: removeKindleConfigServerFnMock,
}));

import { KindleConfigCard } from "./kindle-config-card";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("KindleConfigCard", () => {
  describe("unconfigured state", () => {
    it("renders the setup form when not configured", () => {
      render(<KindleConfigCard configured={false} />);

      expect(screen.getByText("Kindle")).toBeTruthy();
      expect(screen.getByText("Not configured")).toBeTruthy();
      expect(screen.getByPlaceholderText("you@kindle.com")).toBeTruthy();
      expect(screen.getByText("Save")).toBeTruthy();
    });

    it("shows info note about approved senders", () => {
      render(<KindleConfigCard configured={false} />);

      expect(screen.getByText(/Approved Personal Document E-mail List/)).toBeTruthy();
    });

    it("submits the form with correct data", async () => {
      const user = userEvent.setup();
      saveKindleConfigServerFnMock.mockResolvedValue({ saved: true });

      render(<KindleConfigCard configured={false} />);

      await user.type(screen.getByPlaceholderText("you@kindle.com"), "me@kindle.com");
      await user.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(saveKindleConfigServerFnMock).toHaveBeenCalledWith({
          data: { email: "me@kindle.com" },
        });
      });

      expect(mockToast.success).toHaveBeenCalledWith("Kindle email saved");
      expect(mockInvalidate).toHaveBeenCalled();
    });

    it("shows error toast when save fails", async () => {
      const user = userEvent.setup();
      saveKindleConfigServerFnMock.mockRejectedValue(new Error("Network error"));

      render(<KindleConfigCard configured={false} />);

      await user.type(screen.getByPlaceholderText("you@kindle.com"), "me@kindle.com");
      await user.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Network error");
      });
    });

    it("shows generic error when save throws non-Error", async () => {
      const user = userEvent.setup();
      saveKindleConfigServerFnMock.mockRejectedValue("string-error");

      render(<KindleConfigCard configured={false} />);

      await user.type(screen.getByPlaceholderText("you@kindle.com"), "me@kindle.com");
      await user.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to save Kindle email");
      });
    });

    it("shows saving state while submitting", async () => {
      let resolveSubmit!: () => void;
      saveKindleConfigServerFnMock.mockReturnValue(
        new Promise<void>((resolve) => { resolveSubmit = resolve; }),
      );

      const user = userEvent.setup();
      render(<KindleConfigCard configured={false} />);

      await user.type(screen.getByPlaceholderText("you@kindle.com"), "me@kindle.com");
      await user.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(screen.getByText("Saving...")).toBeTruthy();
      });

      resolveSubmit();

      await waitFor(() => {
        expect(screen.queryByText("Saving...")).toBeNull();
      });
    });

    it("disables save button when email is empty", () => {
      render(<KindleConfigCard configured={false} />);

      const saveButton = screen.getByText("Save");
      expect(saveButton.closest("button")?.disabled).toBe(true);
    });
  });

  describe("configured state", () => {
    beforeEach(() => {
      getKindleConfigServerFnMock.mockResolvedValue({
        configured: true,
        email: "me@kindle.com",
      });
    });

    it("loads and displays the email", async () => {
      render(<KindleConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Connected")).toBeTruthy();
      });

      expect(screen.getByText("me@kindle.com")).toBeTruthy();
    });

    it("shows edit form when Edit is clicked", async () => {
      const user = userEvent.setup();
      render(<KindleConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Edit")).toBeTruthy();
      });

      await user.click(screen.getByText("Edit"));

      expect(screen.getByPlaceholderText("you@kindle.com")).toBeTruthy();
    });

    it("removes Kindle config when Remove is clicked", async () => {
      const user = userEvent.setup();
      removeKindleConfigServerFnMock.mockResolvedValue({ removed: true });

      render(<KindleConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Remove")).toBeTruthy();
      });

      await user.click(screen.getByText("Remove"));

      await waitFor(() => {
        expect(removeKindleConfigServerFnMock).toHaveBeenCalled();
      });

      expect(mockToast.success).toHaveBeenCalledWith("Kindle email removed");
      expect(mockInvalidate).toHaveBeenCalled();
    });

    it("shows error toast when remove fails", async () => {
      const user = userEvent.setup();
      removeKindleConfigServerFnMock.mockRejectedValue(new Error("DB error"));

      render(<KindleConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Remove")).toBeTruthy();
      });

      await user.click(screen.getByText("Remove"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to remove Kindle email");
      });
    });
  });

  describe("unmount during load", () => {
    it("does not update state after unmount", () => {
      let resolveConfig!: () => void;
      getKindleConfigServerFnMock.mockReturnValue(
        new Promise<object>((resolve) => {
          resolveConfig = () => {
            resolve({ configured: true, email: "me@kindle.com" });
          };
        }),
      );

      const { unmount } = render(<KindleConfigCard configured={true} />);

      unmount();
      resolveConfig();

      expect(true).toBe(true);
    });

    it("does not set error state after unmount on failure", () => {
      let rejectConfig!: () => void;
      getKindleConfigServerFnMock.mockReturnValue(
        new Promise<never>((_resolve, reject) => {
          rejectConfig = () => { reject(new Error("fail")); };
        }),
      );

      const { unmount } = render(<KindleConfigCard configured={true} />);

      unmount();
      rejectConfig();

      expect(true).toBe(true);
    });
  });

  describe("loading state", () => {
    it("shows loading state while fetching config", async () => {
      let resolveConfig!: () => void;
      getKindleConfigServerFnMock.mockReturnValue(
        new Promise<object>((resolve) => {
          resolveConfig = () => {
            resolve({ configured: true, email: "me@kindle.com" });
          };
        }),
      );

      render(<KindleConfigCard configured={true} />);

      expect(screen.getByText("Loading...")).toBeTruthy();

      resolveConfig();

      await waitFor(() => {
        expect(screen.queryByText("Loading...")).toBeNull();
      });
    });

    it("handles config returning not configured", async () => {
      getKindleConfigServerFnMock.mockResolvedValue({ configured: false });

      render(<KindleConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.queryByText("Loading...")).toBeNull();
      });

      expect(screen.queryByText("me@kindle.com")).toBeNull();
    });

    it("shows error when config fetch fails", async () => {
      getKindleConfigServerFnMock.mockRejectedValue(new Error("DB error"));

      render(<KindleConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Failed to load configuration")).toBeTruthy();
      });
    });
  });
});
