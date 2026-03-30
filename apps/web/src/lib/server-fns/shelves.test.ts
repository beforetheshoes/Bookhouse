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
const collectionItemDeleteManyMock = vi.fn();
const editionFindManyMock = vi.fn();

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
      deleteMany: collectionItemDeleteManyMock,
    },
    edition: {
      findMany: editionFindManyMock,
    },
  },
}));

import {
  getShelvesServerFn,
  getShelfDetailServerFn,
  getShelvesForEditionServerFn,
  getShelvesForWorkServerFn,
  createShelfServerFn,
  renameShelfServerFn,
  deleteShelfServerFn,
  addEditionToShelfServerFn,
  addEditionsForWorkToShelfServerFn,
  bulkAddToShelfServerFn,
  removeEditionFromShelfServerFn,
  removeWorkEditionsFromShelfServerFn,
  getAvailableEditionsServerFn,
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
    it("returns shelf with edition-based items", async () => {
      const detail = {
        id: "s1",
        name: "Fiction",
        formatFilter: "ALL",
        items: [{ edition: { id: "e1", work: { id: "w1", titleDisplay: "Book" } } }],
      };
      collectionFindUniqueOrThrowMock.mockResolvedValue(detail);
      const result = await getShelfDetailServerFn({ data: { shelfId: "s1" } } as never);
      expect(collectionFindUniqueOrThrowMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "s1" } }),
      );
      expect(result).toBe(detail);
    });
  });

  describe("getShelvesForEditionServerFn", () => {
    it("returns collection IDs for an edition", async () => {
      collectionItemFindManyMock.mockResolvedValue([
        { collectionId: "s1" },
        { collectionId: "s2" },
      ]);
      const result = await getShelvesForEditionServerFn({
        data: { editionId: "e1" },
      } as never);
      expect(collectionItemFindManyMock).toHaveBeenCalledWith({
        where: { editionId: "e1" },
        select: { collectionId: true },
      });
      expect(result).toEqual(["s1", "s2"]);
    });

    it("returns empty array when edition is in no shelves", async () => {
      collectionItemFindManyMock.mockResolvedValue([]);
      const result = await getShelvesForEditionServerFn({
        data: { editionId: "e1" },
      } as never);
      expect(result).toEqual([]);
    });
  });

  describe("getShelvesForWorkServerFn", () => {
    it("returns all shelves annotated with membership via editions", async () => {
      editionFindManyMock.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
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

      expect(editionFindManyMock).toHaveBeenCalledWith({
        where: { workId: "w1" },
        select: { id: true },
      });
      expect(result).toEqual([
        { id: "s1", name: "Fiction", isMember: true },
        { id: "s2", name: "Sci-Fi", isMember: false },
      ]);
    });

    it("returns empty membership when work has no editions in shelves", async () => {
      editionFindManyMock.mockResolvedValue([{ id: "e1" }]);
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
    it("creates a shelf with MANUAL kind and ALL format filter", async () => {
      const created = { id: "s1", name: "New Shelf", kind: "MANUAL", formatFilter: "ALL" };
      collectionCreateMock.mockResolvedValue(created);

      const result = await createShelfServerFn({
        data: { name: "New Shelf", formatFilter: "ALL" },
      } as never);

      expect(collectionCreateMock).toHaveBeenCalledWith({
        data: { name: "New Shelf", kind: "MANUAL", formatFilter: "ALL" },
      });
      expect(result).toBe(created);
    });

    it("creates a shelf with EBOOK format filter", async () => {
      const created = { id: "s1", name: "Ebooks", kind: "MANUAL", formatFilter: "EBOOK" };
      collectionCreateMock.mockResolvedValue(created);

      const result = await createShelfServerFn({
        data: { name: "Ebooks", formatFilter: "EBOOK" },
      } as never);

      expect(collectionCreateMock).toHaveBeenCalledWith({
        data: { name: "Ebooks", kind: "MANUAL", formatFilter: "EBOOK" },
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

  describe("addEditionToShelfServerFn", () => {
    it("creates a collection item with editionId", async () => {
      const item = { id: "ci1", collectionId: "s1", editionId: "e1" };
      collectionItemCreateMock.mockResolvedValue(item);

      const result = await addEditionToShelfServerFn({
        data: { shelfId: "s1", editionId: "e1" },
      } as never);

      expect(collectionItemCreateMock).toHaveBeenCalledWith({
        data: { collectionId: "s1", editionId: "e1" },
      });
      expect(result).toBe(item);
    });
  });

  describe("addEditionsForWorkToShelfServerFn", () => {
    it("adds matching editions for a work to a shelf with ALL format filter", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "ALL" });
      editionFindManyMock.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
      collectionItemFindManyMock.mockResolvedValue([]);
      collectionItemCreateManyMock.mockResolvedValue({ count: 2 });

      const result = await addEditionsForWorkToShelfServerFn({
        data: { shelfId: "s1", workId: "w1" },
      } as never);

      expect(collectionFindUniqueOrThrowMock).toHaveBeenCalledWith({
        where: { id: "s1" },
        select: { formatFilter: true },
      });
      expect(editionFindManyMock).toHaveBeenCalledWith({
        where: { workId: "w1" },
        select: { id: true },
      });
      expect(collectionItemCreateManyMock).toHaveBeenCalledWith({
        data: [
          { collectionId: "s1", editionId: "e1" },
          { collectionId: "s1", editionId: "e2" },
        ],
      });
      expect(result).toEqual({ added: 2 });
    });

    it("filters editions by EBOOK format when shelf has EBOOK filter", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "EBOOK" });
      editionFindManyMock.mockResolvedValue([{ id: "e1" }]);
      collectionItemFindManyMock.mockResolvedValue([]);
      collectionItemCreateManyMock.mockResolvedValue({ count: 1 });

      const result = await addEditionsForWorkToShelfServerFn({
        data: { shelfId: "s1", workId: "w1" },
      } as never);

      expect(editionFindManyMock).toHaveBeenCalledWith({
        where: { workId: "w1", formatFamily: "EBOOK" },
        select: { id: true },
      });
      expect(result).toEqual({ added: 1 });
    });

    it("skips existing editions", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "ALL" });
      editionFindManyMock.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
      collectionItemFindManyMock.mockResolvedValue([{ editionId: "e1" }]);
      collectionItemCreateManyMock.mockResolvedValue({ count: 1 });

      const result = await addEditionsForWorkToShelfServerFn({
        data: { shelfId: "s1", workId: "w1" },
      } as never);

      expect(collectionItemCreateManyMock).toHaveBeenCalledWith({
        data: [{ collectionId: "s1", editionId: "e2" }],
      });
      expect(result).toEqual({ added: 1 });
    });

    it("returns zero when no matching editions exist", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "AUDIOBOOK" });
      editionFindManyMock.mockResolvedValue([]);

      const result = await addEditionsForWorkToShelfServerFn({
        data: { shelfId: "s1", workId: "w1" },
      } as never);

      expect(collectionItemCreateManyMock).not.toHaveBeenCalled();
      expect(result).toEqual({ added: 0 });
    });

    it("returns zero when all editions already exist on shelf", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "ALL" });
      editionFindManyMock.mockResolvedValue([{ id: "e1" }]);
      collectionItemFindManyMock.mockResolvedValue([{ editionId: "e1" }]);

      const result = await addEditionsForWorkToShelfServerFn({
        data: { shelfId: "s1", workId: "w1" },
      } as never);

      expect(collectionItemCreateManyMock).not.toHaveBeenCalled();
      expect(result).toEqual({ added: 0 });
    });
  });

  describe("bulkAddToShelfServerFn", () => {
    it("adds editions for multiple works respecting format filter", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "ALL" });
      editionFindManyMock.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
      collectionItemFindManyMock.mockResolvedValue([{ editionId: "e1" }]);
      collectionItemCreateManyMock.mockResolvedValue({ count: 1 });

      const result = await bulkAddToShelfServerFn({
        data: { shelfId: "s1", workIds: ["w1", "w2"] },
      } as never);

      expect(collectionFindUniqueOrThrowMock).toHaveBeenCalledWith({
        where: { id: "s1" },
        select: { formatFilter: true },
      });
      expect(editionFindManyMock).toHaveBeenCalledWith({
        where: { workId: { in: ["w1", "w2"] } },
        select: { id: true },
      });
      expect(collectionItemCreateManyMock).toHaveBeenCalledWith({
        data: [{ collectionId: "s1", editionId: "e2" }],
      });
      expect(result).toEqual({ added: 1 });
    });

    it("skips createMany when all editions already exist", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "ALL" });
      editionFindManyMock.mockResolvedValue([{ id: "e1" }]);
      collectionItemFindManyMock.mockResolvedValue([{ editionId: "e1" }]);

      const result = await bulkAddToShelfServerFn({
        data: { shelfId: "s1", workIds: ["w1"] },
      } as never);

      expect(collectionItemCreateManyMock).not.toHaveBeenCalled();
      expect(result).toEqual({ added: 0 });
    });

    it("returns zero when no editions match format filter", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "EBOOK" });
      editionFindManyMock.mockResolvedValue([]);

      const result = await bulkAddToShelfServerFn({
        data: { shelfId: "s1", workIds: ["w1"] },
      } as never);

      expect(collectionItemCreateManyMock).not.toHaveBeenCalled();
      expect(result).toEqual({ added: 0 });
    });

    it("applies AUDIOBOOK format filter when shelf has AUDIOBOOK filter", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "AUDIOBOOK" });
      editionFindManyMock.mockResolvedValue([{ id: "e3" }]);
      collectionItemFindManyMock.mockResolvedValue([]);
      collectionItemCreateManyMock.mockResolvedValue({ count: 1 });

      const result = await bulkAddToShelfServerFn({
        data: { shelfId: "s1", workIds: ["w1"] },
      } as never);

      expect(editionFindManyMock).toHaveBeenCalledWith({
        where: { workId: { in: ["w1"] }, formatFamily: "AUDIOBOOK" },
        select: { id: true },
      });
      expect(result).toEqual({ added: 1 });
    });
  });

  describe("removeEditionFromShelfServerFn", () => {
    it("deletes the collection item by compound key", async () => {
      collectionItemDeleteMock.mockResolvedValue({ id: "ci1" });

      await removeEditionFromShelfServerFn({
        data: { shelfId: "s1", editionId: "e1" },
      } as never);

      expect(collectionItemDeleteMock).toHaveBeenCalledWith({
        where: {
          collectionId_editionId: {
            collectionId: "s1",
            editionId: "e1",
          },
        },
      });
    });
  });

  describe("removeWorkEditionsFromShelfServerFn", () => {
    it("removes all editions of a work from a shelf", async () => {
      editionFindManyMock.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
      collectionItemDeleteManyMock.mockResolvedValue({ count: 2 });

      const result = await removeWorkEditionsFromShelfServerFn({
        data: { shelfId: "s1", workId: "w1" },
      } as never);

      expect(editionFindManyMock).toHaveBeenCalledWith({
        where: { workId: "w1" },
        select: { id: true },
      });
      expect(collectionItemDeleteManyMock).toHaveBeenCalledWith({
        where: { collectionId: "s1", editionId: { in: ["e1", "e2"] } },
      });
      expect(result).toEqual({ removed: 2 });
    });

    it("returns zero when work has no editions", async () => {
      editionFindManyMock.mockResolvedValue([]);

      const result = await removeWorkEditionsFromShelfServerFn({
        data: { shelfId: "s1", workId: "w1" },
      } as never);

      expect(collectionItemDeleteManyMock).not.toHaveBeenCalled();
      expect(result).toEqual({ removed: 0 });
    });
  });

  describe("getAvailableEditionsServerFn", () => {
    it("returns editions not already on the shelf matching format filter", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "EBOOK" });
      collectionItemFindManyMock.mockResolvedValue([{ editionId: "e1" }]);
      const available = [{ id: "e2", formatFamily: "EBOOK", work: { titleDisplay: "Book" } }];
      editionFindManyMock.mockResolvedValue(available);

      const result = await getAvailableEditionsServerFn({ data: { shelfId: "s1" } } as never);

      expect(collectionFindUniqueOrThrowMock).toHaveBeenCalledWith({
        where: { id: "s1" },
        select: { formatFilter: true },
      });
      expect(editionFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            formatFamily: "EBOOK",
          }) as Record<string, string>,
        }),
      );
      expect(result).toBe(available);
    });

    it("returns all formats when shelf filter is ALL", async () => {
      collectionFindUniqueOrThrowMock.mockResolvedValue({ formatFilter: "ALL" });
      collectionItemFindManyMock.mockResolvedValue([]);
      editionFindManyMock.mockResolvedValue([]);

      await getAvailableEditionsServerFn({ data: { shelfId: "s1" } } as never);

      expect(editionFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            formatFamily: expect.anything() as string,
          }) as Record<string, string>,
        }),
      );
    });
  });
});
