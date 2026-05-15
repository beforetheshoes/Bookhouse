// @vitest-environment happy-dom
import type * as TanstackRouter from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const listUsersServerFnMock = vi.fn();
const listAllowedEmailsServerFnMock = vi.fn();
const addAllowedEmailServerFnMock = vi.fn();
const removeAllowedEmailServerFnMock = vi.fn();
const removeUserServerFnMock = vi.fn();

vi.mock("~/lib/server-fns/users", () => ({
  listUsersServerFn: listUsersServerFnMock,
  listAllowedEmailsServerFn: listAllowedEmailsServerFnMock,
  addAllowedEmailServerFn: addAllowedEmailServerFnMock,
  removeAllowedEmailServerFn: removeAllowedEmailServerFnMock,
  removeUserServerFn: removeUserServerFnMock,
}));

const mockInvalidate = vi.fn();
const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: mockToast }));

interface MockLoaderData {
  users: Array<{
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    createdAt: Date;
    roles: string[];
  }>;
  allowedEmails: Array<{
    id: string;
    email: string;
    createdAt: Date;
    createdBy: string | null;
  }>;
  currentUserId: string;
}

let mockLoaderData: MockLoaderData = {
  users: [],
  allowedEmails: [],
  currentUserId: "owner-1",
};

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouter>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    useRouter: () => ({ invalidate: mockInvalidate }),
    createFileRoute: () => (opts: Record<string, object | ((...a: object[]) => object)>) => ({
      ...opts,
      options: opts,
      useLoaderData: () => mockLoaderData,
    }),
  };
});

describe("UsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoaderData = {
      users: [
        {
          id: "owner-1",
          email: "owner@example.com",
          name: "Owner",
          image: null,
          createdAt: new Date("2026-05-01"),
          roles: ["OWNER"],
        },
        {
          id: "viewer-1",
          email: "viewer@example.com",
          name: null,
          image: null,
          createdAt: new Date("2026-05-02"),
          roles: ["VIEWER"],
        },
      ],
      allowedEmails: [
        {
          id: "ae-1",
          email: "pending@example.com",
          createdAt: new Date("2026-05-02"),
          createdBy: "owner-1",
        },
      ],
      currentUserId: "owner-1",
    };
  });

  it("renders the users table and allowlist", async () => {
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getByText("Users")).toBeTruthy();
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.getByText("viewer@example.com")).toBeTruthy();
    expect(screen.getByText("pending@example.com")).toBeTruthy();
    expect(screen.getByText("OWNER")).toBeTruthy();
    expect(screen.getByText("VIEWER")).toBeTruthy();
  });

  it("does not show a remove button for the current user", async () => {
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.queryByLabelText("Remove owner@example.com")).toBeNull();
    expect(screen.getByLabelText("Remove viewer@example.com")).toBeTruthy();
    expect(screen.getByLabelText("Remove pending@example.com")).toBeTruthy();
  });

  it("renders fallback dashes for missing email and name", async () => {
    mockLoaderData = {
      users: [
        {
          id: "u-x",
          email: null,
          name: null,
          image: null,
          createdAt: new Date("2026-05-03"),
          roles: ["VIEWER"],
        },
      ],
      allowedEmails: [],
      currentUserId: "owner-1",
    };
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText("Remove u-x")).toBeTruthy();
  });

  it("submits a new allowlist entry", async () => {
    addAllowedEmailServerFnMock.mockResolvedValueOnce({
      id: "ae-2",
      email: "newviewer@example.com",
    });
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const input = screen.getByPlaceholderText("viewer@example.com");
    fireEvent.change(input, { target: { value: " newviewer@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(addAllowedEmailServerFnMock).toHaveBeenCalledWith({
        data: { email: "newviewer@example.com" },
      });
    });
    expect(mockToast.success).toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("shows an error toast when adding an allowed email fails", async () => {
    addAllowedEmailServerFnMock.mockRejectedValueOnce(new Error("nope"));
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);

    const input = screen.getByPlaceholderText("viewer@example.com");
    fireEvent.change(input, { target: { value: "bad@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("nope");
    });
  });

  it("falls back to a generic error string when the rejection is not an Error", async () => {
    addAllowedEmailServerFnMock.mockRejectedValueOnce("string failure");
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    const input = screen.getByPlaceholderText("viewer@example.com");
    fireEvent.change(input, { target: { value: "x@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to add email");
    });
  });

  it("does nothing when the email input is empty", async () => {
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    // submit button is disabled for empty input — but submit via form to test guard
    const form = screen
      .getByPlaceholderText("viewer@example.com")
      .closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    expect(addAllowedEmailServerFnMock).not.toHaveBeenCalled();
  });

  it("removes an allowlist entry", async () => {
    removeAllowedEmailServerFnMock.mockResolvedValueOnce({ success: true });
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByLabelText("Remove pending@example.com"));
    await waitFor(() => {
      expect(removeAllowedEmailServerFnMock).toHaveBeenCalledWith({
        data: { id: "ae-1" },
      });
    });
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("toasts an error when removing an allowlist entry fails", async () => {
    removeAllowedEmailServerFnMock.mockRejectedValueOnce(new Error("nope"));
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByLabelText("Remove pending@example.com"));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("nope");
    });
  });

  it("falls back to a generic error string when allowlist removal rejection is not an Error", async () => {
    removeAllowedEmailServerFnMock.mockRejectedValueOnce("string failure");
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByLabelText("Remove pending@example.com"));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to remove");
    });
  });

  it("removes a non-owner user via the table button", async () => {
    removeUserServerFnMock.mockResolvedValueOnce({ success: true });
    mockLoaderData = {
      users: [
        {
          id: "owner-1",
          email: "owner@example.com",
          name: "Owner",
          image: null,
          createdAt: new Date("2026-05-01"),
          roles: ["OWNER"],
        },
        {
          id: "viewer-1",
          email: "viewer@example.com",
          name: "V",
          image: null,
          createdAt: new Date("2026-05-02"),
          roles: ["VIEWER"],
        },
      ],
      allowedEmails: [],
      currentUserId: "owner-1",
    };
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByLabelText("Remove viewer@example.com"));
    await waitFor(() => {
      expect(removeUserServerFnMock).toHaveBeenCalledWith({
        data: { userId: "viewer-1" },
      });
    });
    expect(mockToast.success).toHaveBeenCalledWith("User removed");
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("toasts an error when removing a user fails", async () => {
    removeUserServerFnMock.mockRejectedValueOnce(new Error("cannot"));
    mockLoaderData = {
      users: [
        {
          id: "owner-1",
          email: "owner@example.com",
          name: "Owner",
          image: null,
          createdAt: new Date("2026-05-01"),
          roles: ["OWNER"],
        },
        {
          id: "viewer-1",
          email: "v@example.com",
          name: "V",
          image: null,
          createdAt: new Date("2026-05-02"),
          roles: ["VIEWER"],
        },
      ],
      allowedEmails: [],
      currentUserId: "owner-1",
    };
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByLabelText("Remove v@example.com"));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("cannot");
    });
  });

  it("falls back to a generic error string when user removal rejection is not an Error", async () => {
    removeUserServerFnMock.mockRejectedValueOnce("oh no");
    mockLoaderData = {
      users: [
        {
          id: "owner-1",
          email: "owner@example.com",
          name: "Owner",
          image: null,
          createdAt: new Date("2026-05-01"),
          roles: ["OWNER"],
        },
        {
          id: "viewer-1",
          email: "v@example.com",
          name: "V",
          image: null,
          createdAt: new Date("2026-05-02"),
          roles: ["VIEWER"],
        },
      ],
      allowedEmails: [],
      currentUserId: "owner-1",
    };
    const { Route } = await import("./users");
    const Page = Route.options.component as React.ComponentType;
    render(<Page />);
    fireEvent.click(screen.getByLabelText("Remove v@example.com"));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to remove user");
    });
  });

  it("beforeLoad redirects viewers away from the owner-only Users page", async () => {
    const { Route } = await import("./users");
    const beforeLoad = Route.options.beforeLoad as (args: {
      context: { user?: { roles?: string[] } };
    }) => void;

    expect(() => {
      beforeLoad({ context: { user: { roles: ["VIEWER"] } } });
    }).toThrow();
    expect(() => {
      beforeLoad({ context: {} });
    }).toThrow();
    // Owner is allowed through.
    expect(() => {
      beforeLoad({ context: { user: { roles: ["OWNER"] } } });
    }).not.toThrow();
  });

  it("calls the loader to populate users and allowedEmails", async () => {
    listUsersServerFnMock.mockResolvedValueOnce([]);
    listAllowedEmailsServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./users");
    const loader = Route.options.loader as (args: {
      context: { user?: { id: string } };
    }) => Promise<MockLoaderData>;
    const result = await loader({ context: { user: { id: "owner-1" } } });
    expect(listUsersServerFnMock).toHaveBeenCalled();
    expect(listAllowedEmailsServerFnMock).toHaveBeenCalled();
    expect(result.currentUserId).toBe("owner-1");
  });

  it("defaults currentUserId to empty string when context has no user", async () => {
    listUsersServerFnMock.mockResolvedValueOnce([]);
    listAllowedEmailsServerFnMock.mockResolvedValueOnce([]);
    const { Route } = await import("./users");
    const loader = Route.options.loader as (args: {
      context: { user?: { id: string } };
    }) => Promise<MockLoaderData>;
    const result = await loader({ context: {} });
    expect(result.currentUserId).toBe("");
  });
});
