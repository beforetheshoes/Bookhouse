import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./_guards", () => ({
  ownerOnly: vi.fn().mockResolvedValue({ id: "u1", roles: ["OWNER"] }),
  authenticatedOnly: vi.fn().mockResolvedValue({ id: "u1", roles: ["OWNER"] }),
}));

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
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockDeviceCollectionDeleteMany = vi.fn();
const mockDeviceCollectionCreateMany = vi.fn();
const mockDeviceCollectionFindMany = vi.fn();
const mockCollectionFindMany = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    koboDevice: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
    koboDeviceCollection: {
      deleteMany: mockDeviceCollectionDeleteMany,
      createMany: mockDeviceCollectionCreateMany,
      findMany: mockDeviceCollectionFindMany,
    },
    collection: {
      findMany: mockCollectionFindMany,
    },
  },
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
  });

  describe("getKoboDevicesServerFn", () => {
    it("returns only devices owned by the current user", async () => {
      const devices = [
        { id: "d1", deviceId: "Kobo Clara", status: "ACTIVE", collections: [] },
      ];
      mockFindMany.mockResolvedValue(devices);

      const result = await getKoboDevicesServerFn({} as never);

      expect(result).toEqual(devices);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
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
  });

  describe("revokeKoboDeviceServerFn", () => {
    it("sets device status to REVOKED when current user owns it", async () => {
      mockFindUnique.mockResolvedValue({ userId: "u1" });
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

    it("rejects when another user tries to revoke", async () => {
      mockFindUnique.mockResolvedValue({ userId: "other-user" });

      await expect(
        revokeKoboDeviceServerFn({ data: { deviceId: "d1" } }),
      ).rejects.toThrow("Device not found");
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("rejects when the device does not exist", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        revokeKoboDeviceServerFn({ data: { deviceId: "missing" } }),
      ).rejects.toThrow("Device not found");
    });
  });

  describe("removeKoboDeviceServerFn", () => {
    it("deletes the device when current user owns it", async () => {
      mockFindUnique.mockResolvedValue({ userId: "u1" });
      mockDelete.mockResolvedValue({ id: "d1" });

      const result = await removeKoboDeviceServerFn({
        data: { deviceId: "d1" },
      });

      expect(result).toEqual({ id: "d1" });
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: "d1" } });
    });

    it("rejects when current user does not own the device", async () => {
      mockFindUnique.mockResolvedValue({ userId: "other" });
      await expect(
        removeKoboDeviceServerFn({ data: { deviceId: "d1" } }),
      ).rejects.toThrow("Device not found");
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe("updateDeviceCollectionsServerFn", () => {
    it("replaces device collections when user owns the device and shelves", async () => {
      mockFindUnique.mockResolvedValue({ userId: "u1" });
      mockCollectionFindMany.mockResolvedValue([{ id: "c1" }]);
      const collections = [
        { id: "dc1", koboDeviceId: "d1", collectionId: "c1", collection: { id: "c1", name: "Fiction" } },
      ];
      mockDeviceCollectionFindMany.mockResolvedValue(collections);

      const result = await updateDeviceCollectionsServerFn({
        data: { deviceId: "d1", collectionIds: ["c1"] },
      });

      expect(result).toEqual(collections);
      expect(mockCollectionFindMany).toHaveBeenCalledWith({
        where: { id: { in: ["c1"] }, ownerUserId: "u1" },
        select: { id: true },
      });
      expect(mockDeviceCollectionDeleteMany).toHaveBeenCalledWith({
        where: { koboDeviceId: "d1" },
      });
      expect(mockDeviceCollectionCreateMany).toHaveBeenCalledWith({
        data: [{ koboDeviceId: "d1", collectionId: "c1" }],
      });
    });

    it("only deletes when collectionIds is empty", async () => {
      mockFindUnique.mockResolvedValue({ userId: "u1" });
      mockDeviceCollectionFindMany.mockResolvedValue([]);

      await updateDeviceCollectionsServerFn({
        data: { deviceId: "d1", collectionIds: [] },
      });

      expect(mockCollectionFindMany).not.toHaveBeenCalled();
      expect(mockDeviceCollectionDeleteMany).toHaveBeenCalledWith({
        where: { koboDeviceId: "d1" },
      });
      expect(mockDeviceCollectionCreateMany).not.toHaveBeenCalled();
    });

    it("rejects when current user does not own the device", async () => {
      mockFindUnique.mockResolvedValue({ userId: "other" });
      await expect(
        updateDeviceCollectionsServerFn({
          data: { deviceId: "d1", collectionIds: [] },
        }),
      ).rejects.toThrow("Device not found");
      expect(mockDeviceCollectionDeleteMany).not.toHaveBeenCalled();
    });

    it("rejects when one or more shelves are not owned by current user", async () => {
      mockFindUnique.mockResolvedValue({ userId: "u1" });
      mockCollectionFindMany.mockResolvedValue([{ id: "c1" }]); // requested 2, found 1

      await expect(
        updateDeviceCollectionsServerFn({
          data: { deviceId: "d1", collectionIds: ["c1", "c2"] },
        }),
      ).rejects.toThrow("One or more shelves not found");
      expect(mockDeviceCollectionDeleteMany).not.toHaveBeenCalled();
    });
  });
});
