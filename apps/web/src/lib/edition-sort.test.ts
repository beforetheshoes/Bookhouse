import { describe, it, expect } from "vitest";
import { editionSortKey, sortEditionsByKey } from "./edition-sort";

describe("editionSortKey", () => {
  it("generates sort key from publisher and filename", () => {
    const edition = {
      publisher: "DAW Books",
      editionFiles: [{ fileAsset: { basename: "wind.epub" } }],
    };
    expect(editionSortKey(edition)).toBe("daw books\0wind.epub");
  });

  it("handles null publisher and empty files", () => {
    const edition = {
      publisher: null,
      editionFiles: [] as { fileAsset: { basename: string } }[],
    };
    expect(editionSortKey(edition)).toBe("\0");
  });
});

describe("sortEditionsByKey", () => {
  it("sorts editions by publisher then filename", () => {
    const editions = [
      { publisher: "Zebra Press", editionFiles: [{ fileAsset: { basename: "z.epub" } }] },
      { publisher: "AAA Books", editionFiles: [{ fileAsset: { basename: "b.epub" } }] },
      { publisher: "AAA Books", editionFiles: [{ fileAsset: { basename: "a.epub" } }] },
    ];
    const sorted = sortEditionsByKey(editions);
    expect(sorted.map((e) => e.editionFiles[0]?.fileAsset.basename)).toEqual(["a.epub", "b.epub", "z.epub"]);
  });

  it("handles single element array", () => {
    const editions = [
      { publisher: "AAA", editionFiles: [{ fileAsset: { basename: "a.epub" } }] },
    ];
    const sorted = sortEditionsByKey(editions);
    expect(sorted).toHaveLength(1);
  });
});
