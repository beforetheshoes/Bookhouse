import { describe, expect, it, vi } from "vitest";

const requireOwnerMock = vi.fn();
const requireAuthenticatedMock = vi.fn();

vi.mock("../auth-server", () => ({
  requireOwner: requireOwnerMock,
  requireAuthenticated: requireAuthenticatedMock,
}));

describe("server-fn guards", () => {
  it("ownerOnly delegates to requireOwner and returns the user", async () => {
    requireOwnerMock.mockResolvedValueOnce({ id: "owner-1", roles: ["OWNER"] });
    const { ownerOnly } = await import("./_guards");
    await expect(ownerOnly()).resolves.toMatchObject({ id: "owner-1" });
    expect(requireOwnerMock).toHaveBeenCalledTimes(1);
  });

  it("authenticatedOnly delegates to requireAuthenticated and returns the user", async () => {
    requireAuthenticatedMock.mockResolvedValueOnce({
      id: "viewer-1",
      roles: ["VIEWER"],
    });
    const { authenticatedOnly } = await import("./_guards");
    await expect(authenticatedOnly()).resolves.toMatchObject({
      id: "viewer-1",
    });
  });
});
