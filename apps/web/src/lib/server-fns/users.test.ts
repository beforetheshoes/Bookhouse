import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./_guards", () => ({
  ownerOnly: vi
    .fn()
    .mockResolvedValue({ id: "owner-1", roles: ["OWNER"] }),
  authenticatedOnly: vi
    .fn()
    .mockResolvedValue({ id: "owner-1", roles: ["OWNER"] }),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      validator: () => Builder;
      handler: <T>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      validator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const userFindManyMock = vi.fn();
const userDeleteMock = vi.fn();
const allowedEmailFindManyMock = vi.fn();
const allowedEmailUpsertMock = vi.fn();
const allowedEmailDeleteMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    user: {
      findMany: userFindManyMock,
      delete: userDeleteMock,
    },
    allowedEmail: {
      findMany: allowedEmailFindManyMock,
      upsert: allowedEmailUpsertMock,
      delete: allowedEmailDeleteMock,
    },
  },
}));

import {
  listUsersServerFn,
  listAllowedEmailsServerFn,
  addAllowedEmailServerFn,
  removeAllowedEmailServerFn,
  removeUserServerFn,
} from "./users";

describe("user management server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists users with roles flattened to string arrays", async () => {
    userFindManyMock.mockResolvedValue([
      {
        id: "u1",
        email: "a@example.com",
        name: "A",
        image: null,
        createdAt: new Date("2026-05-01"),
        roles: [{ role: "OWNER" }],
      },
      {
        id: "u2",
        email: "b@example.com",
        name: "B",
        image: null,
        createdAt: new Date("2026-05-02"),
        roles: [{ role: "VIEWER" }],
      },
    ]);

    const result = await listUsersServerFn();
    expect(result[0]?.roles).toEqual(["OWNER"]);
    expect(result[1]?.roles).toEqual(["VIEWER"]);
  });

  it("lists allowed emails ordered by recency", async () => {
    const entries = [{ id: "ae-1", email: "viewer@example.com" }];
    allowedEmailFindManyMock.mockResolvedValue(entries);
    const result = await listAllowedEmailsServerFn();
    expect(allowedEmailFindManyMock).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
    expect(result).toBe(entries);
  });

  it("adds an allowed email (lowercased) and records the owner who added it", async () => {
    allowedEmailUpsertMock.mockResolvedValue({
      id: "ae-1",
      email: "viewer@example.com",
    });

    await addAllowedEmailServerFn({
      data: { email: "  Viewer@Example.com  " },
    } as never);

    expect(allowedEmailUpsertMock).toHaveBeenCalledWith({
      where: { email: "viewer@example.com" },
      create: { email: "viewer@example.com", createdBy: "owner-1" },
      update: {},
    });
  });

  it("removes an allowed email and tolerates a missing record", async () => {
    allowedEmailDeleteMock.mockResolvedValueOnce({ id: "ae-1" });
    await expect(
      removeAllowedEmailServerFn({ data: { id: "ae-1" } } as never),
    ).resolves.toEqual({ success: true });

    const notFoundError = Object.assign(new Error("not found"), { code: "P2025" });
    allowedEmailDeleteMock.mockRejectedValueOnce(notFoundError);
    await expect(
      removeAllowedEmailServerFn({ data: { id: "ae-missing" } } as never),
    ).resolves.toEqual({ success: true });
  });

  it("rethrows non-P2025 errors when removing an allowed email", async () => {
    allowedEmailDeleteMock.mockRejectedValueOnce(new Error("db down"));
    await expect(
      removeAllowedEmailServerFn({ data: { id: "ae-1" } } as never),
    ).rejects.toThrow("db down");
  });

  it("removes a non-owner user", async () => {
    userDeleteMock.mockResolvedValue({ id: "u2" });
    await expect(
      removeUserServerFn({ data: { userId: "u2" } } as never),
    ).resolves.toEqual({ success: true });
    expect(userDeleteMock).toHaveBeenCalledWith({ where: { id: "u2" } });
  });

  it("refuses to remove the current owner", async () => {
    await expect(
      removeUserServerFn({ data: { userId: "owner-1" } } as never),
    ).rejects.toThrow("Cannot remove yourself");
    expect(userDeleteMock).not.toHaveBeenCalled();
  });
});
