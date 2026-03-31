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
const mockDeviceCollectionDeleteMany = vi.fn();
const mockDeviceCollectionCreateMany = vi.fn();
const mockDeviceCollectionFindMany = vi.fn();
const mockGetCurrentUser = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    koboDevice: {
      findMany: mockFindMany,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
    koboDeviceCollection: {
      deleteMany: mockDeviceCollectionDeleteMany,
      createMany: mockDeviceCollectionCreateMany,
      findMany: mockDeviceCollectionFindMany,
    },
  },
}));

vi.mock("~/lib/auth-server", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

const mockGenerateAuthToken = vi.fn().mockReturnValue("a".repeat(64));
const mockGenerateUserKey = vi.fn().mockReturnValue("key123");

vi.mock("@bookhouse/kobo", () => ({
  generateAuthToken: mockGenerateAuthToken,
  generateUserKey: mockGenerateUserKey,
}));

import {
  getKoboDevicesServerFn,
  addKoboDeviceServerFn,
  revokeKoboDeviceServerFn,
  removeKoboDeviceServerFn,
  updateDeviceCollectionsServerFn,
} from "./kobo-devices";

describe("kobo-devices server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: "u1" });
  });

  describe("getKoboDevicesServerFn", () => {
    it("returns all devices with collections", async () => {
      const devices = [
        { id: "d1", deviceId: "Kobo Clara", status: "ACTIVE", collections: [] },
      ];
      mockFindMany.mockResolvedValue(devices);

      const result = await getKoboDevicesServerFn({} as never);

      expect(result).toEqual(devices);
      expect(mockFindMany).toHaveBeenCalledWith({
        include: {
          collections: {
            include: { collection: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("addKoboDeviceServerFn", () => {
    it("creates a new device with generated token and key", async () => {
      const device = {
        id: "d1",
        deviceId: "My Kobo",
        authToken: "a".repeat(64),
        userKey: "key123",
        status: "ACTIVE",
      };
      mockCreate.mockResolvedValue(device);

      const result = await addKoboDeviceServerFn({
        data: { deviceName: "My Kobo" },
      });

      expect(result).toEqual(device);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          deviceId: "My Kobo",
          authToken: "a".repeat(64),
          userKey: "key123",
        },
      });
      expect(mockGenerateAuthToken).toHaveBeenCalled();
      expect(mockGenerateUserKey).toHaveBeenCalledWith("u1", "My Kobo");
    });

    it("throws when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(
        addKoboDeviceServerFn({ data: { deviceName: "My Kobo" } }),
      ).rejects.toThrow("Not authenticated");

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("revokeKoboDeviceServerFn", () => {
    it("sets device status to REVOKED", async () => {
      mockUpdate.mockResolvedValue({ id: "d1", status: "REVOKED" });

      const result = await revokeKoboDeviceServerFn({
        data: { deviceId: "d1" },
      });

      expect(result).toEqual({ id: "d1", status: "REVOKED" });
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "d1" },
        data: { status: "REVOKED" },
      });
    });
  });

  describe("removeKoboDeviceServerFn", () => {
    it("deletes the device", async () => {
      mockDelete.mockResolvedValue({ id: "d1" });

      const result = await removeKoboDeviceServerFn({
        data: { deviceId: "d1" },
      });

      expect(result).toEqual({ id: "d1" });
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: "d1" } });
    });
  });

  describe("updateDeviceCollectionsServerFn", () => {
    it("replaces device collections", async () => {
      const collections = [
        { id: "dc1", koboDeviceId: "d1", collectionId: "c1", collection: { id: "c1", name: "Fiction" } },
      ];
      mockDeviceCollectionFindMany.mockResolvedValue(collections);

      const result = await updateDeviceCollectionsServerFn({
        data: { deviceId: "d1", collectionIds: ["c1"] },
      });

      expect(result).toEqual(collections);
      expect(mockDeviceCollectionDeleteMany).toHaveBeenCalledWith({
        where: { koboDeviceId: "d1" },
      });
      expect(mockDeviceCollectionCreateMany).toHaveBeenCalledWith({
        data: [{ koboDeviceId: "d1", collectionId: "c1" }],
      });
    });

    it("only deletes when collectionIds is empty", async () => {
      mockDeviceCollectionFindMany.mockResolvedValue([]);

      await updateDeviceCollectionsServerFn({
        data: { deviceId: "d1", collectionIds: [] },
      });

      expect(mockDeviceCollectionDeleteMany).toHaveBeenCalledWith({
        where: { koboDeviceId: "d1" },
      });
      expect(mockDeviceCollectionCreateMany).not.toHaveBeenCalled();
    });
  });
});
