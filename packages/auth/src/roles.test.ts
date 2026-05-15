import { describe, expect, it, vi } from "vitest";
import {
  OWNER_ROLE,
  VIEWER_ROLE,
  getUserRoles,
  hasRole,
  isOwner,
} from "./roles";

describe("role helpers", () => {
  it("exposes role string constants", () => {
    expect(OWNER_ROLE).toBe("OWNER");
    expect(VIEWER_ROLE).toBe("VIEWER");
  });

  it("returns the list of roles for a user", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ role: "OWNER" }, { role: "VIEWER" }]);

    const roles = await getUserRoles(
      { userRole: { findMany } } as never,
      "user-1",
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { role: true },
    });
    expect(roles).toEqual(["OWNER", "VIEWER"]);
  });

  it("returns true when the role exists for the user", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "urole-1" });

    const result = await hasRole(
      { userRole: { findUnique } } as never,
      "user-1",
      "OWNER",
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_role: { userId: "user-1", role: "OWNER" } },
      select: { id: true },
    });
    expect(result).toBe(true);
  });

  it("returns false when the role is not assigned", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);

    const result = await hasRole(
      { userRole: { findUnique } } as never,
      "user-1",
      "OWNER",
    );

    expect(result).toBe(false);
  });

  it("identifies owner via roles list", () => {
    expect(isOwner(["OWNER"])).toBe(true);
    expect(isOwner(["VIEWER"])).toBe(false);
    expect(isOwner([])).toBe(false);
  });
});
