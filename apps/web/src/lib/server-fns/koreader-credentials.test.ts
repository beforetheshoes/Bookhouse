import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: (schema: object) => Builder;
      handler: <T extends Record<string, string | number | boolean | null | string[] | Date | undefined>>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockHashPassword = vi.fn().mockResolvedValue("salt:hash");

vi.mock("@bookhouse/db", () => ({
  db: {
    koreaderCredential: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
      update: mockUpdate,
    },
  },
}));

vi.mock("~/lib/auth-server", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@bookhouse/opds", () => ({
  hashPassword: mockHashPassword,
}));

import {
  getKoreaderCredentialServerFn,
  saveKoreaderCredentialServerFn,
  toggleKoreaderCredentialServerFn,
} from "./koreader-credentials";

describe("koreader-credentials server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: "u1" });
  });

  it("returns the current user's KOReader credential", async () => {
    const credential = { id: "kc1", username: "reader", isEnabled: true, createdAt: new Date(), updatedAt: new Date() };
    mockFindUnique.mockResolvedValue(credential);

    const result = await getKoreaderCredentialServerFn({} as never);

    expect(result).toEqual(credential);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: {
        id: true,
        username: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("requires authentication to read credentials", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);

    await expect(getKoreaderCredentialServerFn({} as never)).rejects.toThrow("Not authenticated");
  });

  it("upserts KOReader credentials with a hashed password", async () => {
    const saved = { id: "kc1", username: "reader", isEnabled: false, createdAt: new Date(), updatedAt: new Date() };
    mockUpsert.mockResolvedValue(saved);

    const result = await saveKoreaderCredentialServerFn({
      data: { username: "reader", password: "supersecret" },
    });

    expect(result).toEqual(saved);
    expect(mockHashPassword).toHaveBeenCalledWith("supersecret");
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: {
        userId: "u1",
        username: "reader",
        passwordHash: "salt:hash",
      },
      update: {
        username: "reader",
        passwordHash: "salt:hash",
      },
      select: {
        id: true,
        username: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("requires authentication to save credentials", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);

    await expect(saveKoreaderCredentialServerFn({
      data: { username: "reader", password: "supersecret" },
    })).rejects.toThrow("Not authenticated");
  });

  it("toggles the enabled state", async () => {
    const toggled = { id: "kc1", username: "reader", isEnabled: true, createdAt: new Date(), updatedAt: new Date() };
    mockUpdate.mockResolvedValue(toggled);

    const result = await toggleKoreaderCredentialServerFn({
      data: { isEnabled: true },
    });

    expect(result).toEqual(toggled);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { isEnabled: true },
      select: {
        id: true,
        username: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("requires authentication to toggle credentials", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);

    await expect(toggleKoreaderCredentialServerFn({
      data: { isEnabled: true },
    })).rejects.toThrow("Not authenticated");
  });
});
