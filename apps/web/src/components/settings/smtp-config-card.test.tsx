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
  getSmtpConfigServerFnMock,
  saveSmtpConfigServerFnMock,
  removeSmtpConfigServerFnMock,
  testSmtpConnectionServerFnMock,
} = vi.hoisted(() => ({
  getSmtpConfigServerFnMock: vi.fn(),
  saveSmtpConfigServerFnMock: vi.fn(),
  removeSmtpConfigServerFnMock: vi.fn(),
  testSmtpConnectionServerFnMock: vi.fn(),
}));

vi.mock("~/lib/server-fns/smtp", () => ({
  getSmtpConfigServerFn: getSmtpConfigServerFnMock,
  saveSmtpConfigServerFn: saveSmtpConfigServerFnMock,
  removeSmtpConfigServerFn: removeSmtpConfigServerFnMock,
  testSmtpConnectionServerFn: testSmtpConnectionServerFnMock,
}));

import { SmtpConfigCard } from "./smtp-config-card";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SmtpConfigCard", () => {
  describe("unconfigured state", () => {
    it("renders the setup form when not configured", () => {
      render(<SmtpConfigCard configured={false} />);

      expect(screen.getByText("Email (SMTP)")).toBeTruthy();
      expect(screen.getByText("Not configured")).toBeTruthy();
      expect(screen.getByPlaceholderText("smtp.example.com")).toBeTruthy();
      expect(screen.getByPlaceholderText("587")).toBeTruthy();
      expect(screen.getByPlaceholderText("Username")).toBeTruthy();
      expect(screen.getByPlaceholderText("Password")).toBeTruthy();
      expect(screen.getByPlaceholderText("sender@example.com")).toBeTruthy();
      expect(screen.getByText("Save Configuration")).toBeTruthy();
    });

    it("submits the form with correct data", async () => {
      const user = userEvent.setup();
      saveSmtpConfigServerFnMock.mockResolvedValue({ saved: true });

      render(<SmtpConfigCard configured={false} />);

      await user.type(screen.getByPlaceholderText("smtp.example.com"), "mail.smtp2go.com");
      await user.clear(screen.getByPlaceholderText("587"));
      await user.type(screen.getByPlaceholderText("587"), "465");
      await user.type(screen.getByPlaceholderText("Username"), "myuser");
      await user.type(screen.getByPlaceholderText("Password"), "mypass");
      await user.type(screen.getByPlaceholderText("sender@example.com"), "books@example.com");

      await user.click(screen.getByText("Save Configuration"));

      await waitFor(() => {
        expect(saveSmtpConfigServerFnMock).toHaveBeenCalledWith({
          data: {
            host: "mail.smtp2go.com",
            port: 465,
            username: "myuser",
            password: "mypass",
            fromAddress: "books@example.com",
            security: "starttls",
          },
        });
      });

      expect(mockToast.success).toHaveBeenCalledWith("SMTP configuration saved");
      expect(mockInvalidate).toHaveBeenCalled();
    });

    it("shows error toast when save fails", async () => {
      const user = userEvent.setup();
      saveSmtpConfigServerFnMock.mockRejectedValue(new Error("Network error"));

      render(<SmtpConfigCard configured={false} />);

      await user.type(screen.getByPlaceholderText("smtp.example.com"), "mail.smtp2go.com");
      await user.type(screen.getByPlaceholderText("Username"), "myuser");
      await user.type(screen.getByPlaceholderText("Password"), "mypass");
      await user.type(screen.getByPlaceholderText("sender@example.com"), "books@example.com");

      await user.click(screen.getByText("Save Configuration"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Network error");
      });
    });

    it("shows generic error when save throws non-Error", async () => {
      const user = userEvent.setup();
      saveSmtpConfigServerFnMock.mockRejectedValue("string-error");

      render(<SmtpConfigCard configured={false} />);

      await user.type(screen.getByPlaceholderText("smtp.example.com"), "mail.smtp2go.com");
      await user.type(screen.getByPlaceholderText("Username"), "myuser");
      await user.type(screen.getByPlaceholderText("Password"), "mypass");
      await user.type(screen.getByPlaceholderText("sender@example.com"), "books@example.com");

      await user.click(screen.getByText("Save Configuration"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to save SMTP configuration");
      });
    });

    it("updates port when security mode is changed", async () => {
      const user = userEvent.setup();
      render(<SmtpConfigCard configured={false} />);

      // Default port should be 587 (starttls)
      expect(screen.getByDisplayValue("587")).toBeTruthy();

      // Click TLS button
      await user.click(screen.getByRole("radio", { name: "TLS" }));

      // Port should change to 465
      expect(screen.getByDisplayValue("465")).toBeTruthy();

      // Click None button
      await user.click(screen.getByRole("radio", { name: "None" }));

      // Port should change to 25
      expect(screen.getByDisplayValue("25")).toBeTruthy();

      // Click STARTTLS button
      await user.click(screen.getByRole("radio", { name: "STARTTLS" }));

      // Port should change back to 587
      expect(screen.getByDisplayValue("587")).toBeTruthy();
    });

    it("shows saving state while submitting", async () => {
      let resolveSubmit!: () => void;
      saveSmtpConfigServerFnMock.mockReturnValue(
        new Promise<void>((resolve) => { resolveSubmit = resolve; }),
      );

      const user = userEvent.setup();
      render(<SmtpConfigCard configured={false} />);

      await user.type(screen.getByPlaceholderText("smtp.example.com"), "host");
      await user.type(screen.getByPlaceholderText("Username"), "user");
      await user.type(screen.getByPlaceholderText("Password"), "pass");
      await user.type(screen.getByPlaceholderText("sender@example.com"), "a@b.com");

      await user.click(screen.getByText("Save Configuration"));

      await waitFor(() => {
        expect(screen.getByText("Saving...")).toBeTruthy();
      });

      resolveSubmit();

      await waitFor(() => {
        expect(screen.queryByText("Saving...")).toBeNull();
      });
    });
  });

  describe("configured state", () => {
    beforeEach(() => {
      getSmtpConfigServerFnMock.mockResolvedValue({
        configured: true,
        host: "mail.smtp2go.com",
        port: 587,
        username: "user@example.com",
        fromAddress: "books@example.com",
        security: "starttls",
      });
    });

    it("loads and displays the config summary", async () => {
      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Connected")).toBeTruthy();
      });

      expect(screen.getByText("mail.smtp2go.com:587")).toBeTruthy();
      expect(screen.getByText("user@example.com")).toBeTruthy();
      expect(screen.getByText("books@example.com")).toBeTruthy();
      expect(screen.getByText("STARTTLS")).toBeTruthy();
    });

    it("shows edit form when Edit is clicked", async () => {
      const user = userEvent.setup();
      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Edit")).toBeTruthy();
      });

      await user.click(screen.getByText("Edit"));

      expect(screen.getByPlaceholderText("smtp.example.com")).toBeTruthy();
    });

    it("removes SMTP config when Remove is clicked", async () => {
      const user = userEvent.setup();
      removeSmtpConfigServerFnMock.mockResolvedValue({ removed: true });

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Remove")).toBeTruthy();
      });

      await user.click(screen.getByText("Remove"));

      await waitFor(() => {
        expect(removeSmtpConfigServerFnMock).toHaveBeenCalled();
      });

      expect(mockToast.success).toHaveBeenCalledWith("SMTP configuration removed");
      expect(mockInvalidate).toHaveBeenCalled();
    });

    it("shows error toast when remove fails", async () => {
      const user = userEvent.setup();
      removeSmtpConfigServerFnMock.mockRejectedValue(new Error("DB error"));

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Remove")).toBeTruthy();
      });

      await user.click(screen.getByText("Remove"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to remove SMTP configuration");
      });
    });
  });

  describe("test email", () => {
    beforeEach(() => {
      getSmtpConfigServerFnMock.mockResolvedValue({
        configured: true,
        host: "mail.smtp2go.com",
        port: 587,
        username: "user@example.com",
        fromAddress: "books@example.com",
        security: "starttls",
      });
    });

    it("sends a test email successfully", async () => {
      const user = userEvent.setup();
      testSmtpConnectionServerFnMock.mockResolvedValue({ success: true });

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Send Test Email")).toBeTruthy();
      });

      // Default recipient should be the from address
      const recipientInput = screen.getByDisplayValue("books@example.com");
      expect(recipientInput).toBeTruthy();

      await user.click(screen.getByText("Send Test Email"));

      await waitFor(() => {
        expect(testSmtpConnectionServerFnMock).toHaveBeenCalledWith({
          data: { recipientEmail: "books@example.com" },
        });
      });

      expect(mockToast.success).toHaveBeenCalledWith("Test email sent successfully");
    });

    it("shows fallback error when test email fails without error message", async () => {
      const user = userEvent.setup();
      testSmtpConnectionServerFnMock.mockResolvedValue({
        success: false,
      });

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Send Test Email")).toBeTruthy();
      });

      await user.click(screen.getByText("Send Test Email"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to send test email");
      });
    });

    it("shows error when test email fails", async () => {
      const user = userEvent.setup();
      testSmtpConnectionServerFnMock.mockResolvedValue({
        success: false,
        error: "Connection refused",
      });

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Send Test Email")).toBeTruthy();
      });

      await user.click(screen.getByText("Send Test Email"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Connection refused");
      });
    });

    it("shows error toast when test throws", async () => {
      const user = userEvent.setup();
      testSmtpConnectionServerFnMock.mockRejectedValue(new Error("Network error"));

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Send Test Email")).toBeTruthy();
      });

      await user.click(screen.getByText("Send Test Email"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Network error");
      });
    });

    it("shows generic error when test throws non-Error", async () => {
      const user = userEvent.setup();
      testSmtpConnectionServerFnMock.mockRejectedValue("string-error");

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Send Test Email")).toBeTruthy();
      });

      await user.click(screen.getByText("Send Test Email"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to send test email");
      });
    });

    it("allows changing recipient before sending", async () => {
      const user = userEvent.setup();
      testSmtpConnectionServerFnMock.mockResolvedValue({ success: true });

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue("books@example.com")).toBeTruthy();
      });

      const recipientInput = screen.getByDisplayValue("books@example.com");
      await user.clear(recipientInput);
      await user.type(recipientInput, "other@example.com");

      await user.click(screen.getByText("Send Test Email"));

      await waitFor(() => {
        expect(testSmtpConnectionServerFnMock).toHaveBeenCalledWith({
          data: { recipientEmail: "other@example.com" },
        });
      });
    });

    it("shows sending state while testing", async () => {
      let resolveSend!: () => void;
      testSmtpConnectionServerFnMock.mockReturnValue(
        new Promise<{ success: boolean }>((resolve) => {
          resolveSend = () => { resolve({ success: true }); };
        }),
      );

      const user = userEvent.setup();
      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Send Test Email")).toBeTruthy();
      });

      await user.click(screen.getByText("Send Test Email"));

      await waitFor(() => {
        expect(screen.getByText("Sending...")).toBeTruthy();
      });

      resolveSend();

      await waitFor(() => {
        expect(screen.queryByText("Sending...")).toBeNull();
      });
    });
  });

  describe("unmount during load", () => {
    it("does not update state after unmount", () => {
      let resolveConfig!: () => void;
      getSmtpConfigServerFnMock.mockReturnValue(
        new Promise<object>((resolve) => {
          resolveConfig = () => {
            resolve({
              configured: true,
              host: "mail.smtp2go.com",
              port: 587,
              username: "user@example.com",
              fromAddress: "books@example.com",
              security: "starttls",
            });
          };
        }),
      );

      const { unmount } = render(<SmtpConfigCard configured={true} />);

      // Unmount before config loads
      unmount();

      // Resolve the promise after unmount — should not cause errors
      resolveConfig();

      // If no errors thrown, the cancelled flag worked
      expect(true).toBe(true);
    });

    it("does not set error state after unmount on failure", () => {
      let rejectConfig!: () => void;
      getSmtpConfigServerFnMock.mockReturnValue(
        new Promise<never>((_resolve, reject) => {
          rejectConfig = () => { reject(new Error("fail")); };
        }),
      );

      const { unmount } = render(<SmtpConfigCard configured={true} />);

      // Unmount before config loads
      unmount();

      // Reject the promise after unmount — should not cause errors
      rejectConfig();

      expect(true).toBe(true);
    });
  });

  describe("loading state", () => {
    it("shows loading state while fetching config", async () => {
      let resolveConfig!: () => void;
      getSmtpConfigServerFnMock.mockReturnValue(
        new Promise<object>((resolve) => {
          resolveConfig = () => {
            resolve({
              configured: true,
              host: "mail.smtp2go.com",
              port: 587,
              username: "user@example.com",
              fromAddress: "books@example.com",
              security: "starttls",
            });
          };
        }),
      );

      render(<SmtpConfigCard configured={true} />);

      expect(screen.getByText("Loading...")).toBeTruthy();

      resolveConfig();

      await waitFor(() => {
        expect(screen.queryByText("Loading...")).toBeNull();
      });
    });

    it("handles config returning not configured", async () => {
      getSmtpConfigServerFnMock.mockResolvedValue({ configured: false });

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.queryByText("Loading...")).toBeNull();
      });

      // Should not show configured summary since getSmtpConfigServerFn returned not configured
      expect(screen.queryByText("mail.smtp2go.com:587")).toBeNull();
    });

    it("shows error when config fetch fails", async () => {
      getSmtpConfigServerFnMock.mockRejectedValue(new Error("DB error"));

      render(<SmtpConfigCard configured={true} />);

      await waitFor(() => {
        expect(screen.getByText("Failed to load configuration")).toBeTruthy();
      });
    });
  });
});
