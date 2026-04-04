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

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockHashPassword = vi.fn().mockResolvedValue("salt:hash");

vi.mock("@bookhouse/db", () => ({
  db: {
    opdsCredential: {
      findMany: mockFindMany,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
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
  getOpdsCredentialsServerFn,
  createOpdsCredentialServerFn,
  toggleOpdsCredentialServerFn,
  deleteOpdsCredentialServerFn,
} from "./opds-credentials";

describe("opds-credentials server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: "u1" });
  });

  describe("getOpdsCredentialsServerFn", () => {
    it("returns credentials for the current user", async () => {
      const credentials = [
        { id: "c1", username: "reader", isEnabled: true, createdAt: new Date() },
      ];
      mockFindMany.mockResolvedValue(credentials);

      const result = await getOpdsCredentialsServerFn({} as never);

      expect(result).toEqual(credentials);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
        select: {
          id: true,
          username: true,
          isEnabled: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    });

    it("throws when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(
        getOpdsCredentialsServerFn({} as never),
      ).rejects.toThrow("Not authenticated");
    });
  });

  describe("createOpdsCredentialServerFn", () => {
    it("creates a credential with hashed password", async () => {
      const credential = {
        id: "c1",
        username: "reader",
        isEnabled: true,
        createdAt: new Date(),
      };
      mockCreate.mockResolvedValue(credential);

      const result = await createOpdsCredentialServerFn({
        data: { username: "reader", password: "securepass123" },
      });

      expect(result).toEqual(credential);
      expect(mockHashPassword).toHaveBeenCalledWith("securepass123");
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          username: "reader",
          passwordHash: "salt:hash",
        },
        select: {
          id: true,
          username: true,
          isEnabled: true,
          createdAt: true,
        },
      });
    });

    it("throws when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(
        createOpdsCredentialServerFn({
          data: { username: "reader", password: "securepass123" },
        }),
      ).rejects.toThrow("Not authenticated");

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("toggleOpdsCredentialServerFn", () => {
    it("updates the isEnabled flag", async () => {
      mockUpdate.mockResolvedValue({
        id: "c1",
        username: "reader",
        isEnabled: false,
        createdAt: new Date(),
      });

      const result = await toggleOpdsCredentialServerFn({
        data: { credentialId: "c1", isEnabled: false },
      });

      expect(result.isEnabled).toBe(false);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { isEnabled: false },
        select: {
          id: true,
          username: true,
          isEnabled: true,
          createdAt: true,
        },
      });
    });
  });

  describe("deleteOpdsCredentialServerFn", () => {
    it("deletes the credential", async () => {
      mockDelete.mockResolvedValue({ id: "c1" });

      const result = await deleteOpdsCredentialServerFn({
        data: { credentialId: "c1" },
      });

      expect(result).toEqual({ id: "c1" });
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: "c1" },
      });
    });
  });
});
