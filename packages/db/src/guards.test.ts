import { describe, expect, it, vi } from "vitest";
import {
  MissingEditionError,
  assertEditionExists,
  editionExists,
  type EditionExistsClient,
} from "./guards";

function makeDb(result: { id: string } | null): {
  db: EditionExistsClient;
  findUnique: ReturnType<typeof vi.fn>;
} {
  const findUnique = vi.fn().mockResolvedValue(result);
  return { db: { edition: { findUnique } }, findUnique };
}

describe("editionExists", () => {
  it("returns true and queries by id when the edition exists", async () => {
    const { db, findUnique } = makeDb({ id: "ed-1" });

    await expect(editionExists(db, "ed-1")).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "ed-1" },
      select: { id: true },
    });
  });

  it("returns false when the edition is gone", async () => {
    const { db } = makeDb(null);

    await expect(editionExists(db, "missing")).resolves.toBe(false);
  });
});

describe("assertEditionExists", () => {
  it("resolves when the edition exists", async () => {
    const { db } = makeDb({ id: "ed-1" });

    await expect(assertEditionExists(db, "ed-1")).resolves.toBeUndefined();
  });

  it("throws MissingEditionError carrying the id when the edition is gone", async () => {
    const { db } = makeDb(null);

    await expect(assertEditionExists(db, "gone")).rejects.toBeInstanceOf(
      MissingEditionError,
    );
    await expect(assertEditionExists(db, "gone")).rejects.toMatchObject({
      editionId: "gone",
      name: "MissingEditionError",
    });
  });
});
