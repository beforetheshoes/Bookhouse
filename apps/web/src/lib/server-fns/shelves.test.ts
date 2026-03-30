import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: <T>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const collectionFindManyMock = vi.fn();
const collectionFindUniqueOrThrowMock = vi.fn();
const collectionCreateMock = vi.fn();
const collectionUpdateMock = vi.fn();
const collectionDeleteMock = vi.fn();
const collectionItemFindManyMock = vi.fn();
const collectionItemCreateMock = vi.fn();
const collectionItemCreateManyMock = vi.fn();
const collectionItemDeleteMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    collection: {
      findMany: collectionFindManyMock,
      findUniqueOrThrow: collectionFindUniqueOrThrowMock,
      create: collectionCreateMock,
      update: collectionUpdateMock,
      delete: collectionDeleteMock,
    },
    collectionItem: {
      findMany: collectionItemFindManyMock,
      create: collectionItemCreateMock,
      createMany: collectionItemCreateManyMock,
      delete: collectionItemDeleteMock,
    },
  },
}));

import {
  getShelvesServerFn,
  getShelfDetailServerFn,
  getShelvesForWorkServerFn,
  createShelfServerFn,
  renameShelfServerFn,
  deleteShelfServerFn,
  addWorkToShelfServerFn,
  bulkAddToShelfServerFn,
  removeWorkFromShelfServerFn,
} from "./shelves";

describe("shelves server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getShelvesServerFn", () => {
    it("returns all shelves with item counts", async () => {
      const shelves = [{ id: "1", name: "Fiction", _count: { items: 5 } }];
      collectionFindManyMock.mockResolvedValue(shelves);
      const result = await getShelvesServerFn();
      expect(collectionFindManyMock).toHaveBeenCalledWith({
        include: { _count: { select: { items: true } } },
        orderBy: { name: "asc" },
      });
      expect(result).toBe(shelves);
    });
  });

  describe("getShelfDetailServerFn", () => {
    it("returns shelf with member works", async () => {
      const detail = {
        id: "s1",
        name: "Fiction",
        items: [{ work: { id: "w1", titleDisplay: "Book" } }],
      };
      collectionFindUniqueOrThrowMock.mockResolvedValue(detail);
      const result = await getShelfDetailServerFn({ data: { shelfId: "s1" } } as never);
      expect(collectionFindUniqueOrThrowMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "s1" } }),
      );
      expect(result).toBe(detail);
    });
  });

  describe("getShelvesForWorkServerFn", () => {
    it("returns all shelves annotated with membership", async () => {
      collectionFindManyMock.mockResolvedValue([
        { id: "s1", name: "Fiction" },
        { id: "s2", name: "Sci-Fi" },
      ]);
      collectionItemFindManyMock.mockResolvedValue([
        { collectionId: "s1" },
      ]);

      const result = await getShelvesForWorkServerFn({
        data: { workId: "w1" },
      } as never);

      expect(result).toEqual([
        { id: "s1", name: "Fiction", isMember: true },
        { id: "s2", name: "Sci-Fi", isMember: false },
      ]);
    });

    it("returns empty membership when work is in no shelves", async () => {
      collectionFindManyMock.mockResolvedValue([
        { id: "s1", name: "Fiction" },
      ]);
      collectionItemFindManyMock.mockResolvedValue([]);

      const result = await getShelvesForWorkServerFn({
        data: { workId: "w1" },
      } as never);

      expect(result).toEqual([
        { id: "s1", name: "Fiction", isMember: false },
      ]);
    });
  });

  describe("createShelfServerFn", () => {
    it("creates a shelf with MANUAL kind", async () => {
      const created = { id: "s1", name: "New Shelf", kind: "MANUAL" };
      collectionCreateMock.mockResolvedValue(created);

      const result = await createShelfServerFn({
        data: { name: "New Shelf" },
      } as never);

      expect(collectionCreateMock).toHaveBeenCalledWith({
        data: { name: "New Shelf", kind: "MANUAL" },
      });
      expect(result).toBe(created);
    });
  });

  describe("renameShelfServerFn", () => {
    it("updates the shelf name", async () => {
      const updated = { id: "s1", name: "Renamed" };
      collectionUpdateMock.mockResolvedValue(updated);

      const result = await renameShelfServerFn({
        data: { shelfId: "s1", name: "Renamed" },
      } as never);

      expect(collectionUpdateMock).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: { name: "Renamed" },
      });
      expect(result).toBe(updated);
    });
  });

  describe("deleteShelfServerFn", () => {
    it("deletes the shelf", async () => {
      collectionDeleteMock.mockResolvedValue({ id: "s1" });

      await deleteShelfServerFn({
        data: { shelfId: "s1" },
      } as never);

      expect(collectionDeleteMock).toHaveBeenCalledWith({
        where: { id: "s1" },
      });
    });
  });

  describe("addWorkToShelfServerFn", () => {
    it("creates a collection item", async () => {
      const item = { id: "ci1", collectionId: "s1", workId: "w1" };
      collectionItemCreateMock.mockResolvedValue(item);

      const result = await addWorkToShelfServerFn({
        data: { shelfId: "s1", workId: "w1" },
      } as never);

      expect(collectionItemCreateMock).toHaveBeenCalledWith({
        data: { collectionId: "s1", workId: "w1" },
      });
      expect(result).toBe(item);
    });
  });

  describe("bulkAddToShelfServerFn", () => {
    it("adds only works not already on the shelf", async () => {
      collectionItemFindManyMock.mockResolvedValue([{ workId: "w1" }]);
      collectionItemCreateManyMock.mockResolvedValue({ count: 1 });

      const result = await bulkAddToShelfServerFn({
        data: { shelfId: "s1", workIds: ["w1", "w2"] },
      } as never);

      expect(collectionItemCreateManyMock).toHaveBeenCalledWith({
        data: [{ collectionId: "s1", workId: "w2" }],
      });
      expect(result).toEqual({ added: 1 });
    });

    it("skips createMany when all works already exist", async () => {
      collectionItemFindManyMock.mockResolvedValue([
        { workId: "w1" },
        { workId: "w2" },
      ]);

      const result = await bulkAddToShelfServerFn({
        data: { shelfId: "s1", workIds: ["w1", "w2"] },
      } as never);

      expect(collectionItemCreateManyMock).not.toHaveBeenCalled();
      expect(result).toEqual({ added: 0 });
    });
  });

  describe("removeWorkFromShelfServerFn", () => {
    it("deletes the collection item by compound key", async () => {
      collectionItemDeleteMock.mockResolvedValue({ id: "ci1" });

      await removeWorkFromShelfServerFn({
        data: { shelfId: "s1", workId: "w1" },
      } as never);

      expect(collectionItemDeleteMock).toHaveBeenCalledWith({
        where: {
          collectionId_workId: {
            collectionId: "s1",
            workId: "w1",
          },
        },
      });
    });
  });
});
