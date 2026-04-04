import { describe, expect, it } from "vitest";
import { mapEditionToOpds } from "./edition-mapper";
import type { EditionQueryResult } from "./edition-mapper";

function makeEditionResult(overrides: Partial<EditionQueryResult> = {}): EditionQueryResult {
  return {
    id: "ed-1",
    workId: "work-1",
    publisher: "Acme Books",
    publishedAt: new Date("2023-01-15"),
    isbn13: "9781234567890",
    language: "en",
    updatedAt: new Date("2024-06-01T12:00:00Z"),
    work: {
      titleDisplay: "Test Book",
      sortTitle: "test book",
      description: "A description",
      coverPath: "work-1",
      seriesPosition: 1,
      series: { name: "Test Series" },
    },
    contributors: [
      { role: "AUTHOR", contributor: { nameDisplay: "Jane Doe" } },
    ],
    editionFiles: [
      {
        id: "ef-1",
        fileAsset: {
          mimeType: "application/epub+zip",
          sizeBytes: 1000n,
          basename: "test.epub",
        },
      },
    ],
    ...overrides,
  };
}

describe("mapEditionToOpds", () => {
  it("maps all fields correctly", () => {
    const result = mapEditionToOpds(makeEditionResult());

    expect(result.editionId).toBe("ed-1");
    expect(result.workId).toBe("work-1");
    expect(result.titleDisplay).toBe("Test Book");
    expect(result.sortTitle).toBe("test book");
    expect(result.description).toBe("A description");
    expect(result.coverPath).toBe("work-1");
    expect(result.publisher).toBe("Acme Books");
    expect(result.isbn13).toBe("9781234567890");
    expect(result.language).toBe("en");
    expect(result.seriesName).toBe("Test Series");
    expect(result.seriesPosition).toBe(1);
  });

  it("maps contributors", () => {
    const result = mapEditionToOpds(makeEditionResult());
    expect(result.contributors).toEqual([{ name: "Jane Doe", role: "AUTHOR" }]);
  });

  it("maps files", () => {
    const result = mapEditionToOpds(makeEditionResult());
    expect(result.files).toEqual([
      {
        editionFileId: "ef-1",
        mimeType: "application/epub+zip",
        sizeBytes: 1000n,
        basename: "test.epub",
      },
    ]);
  });

  it("handles null series", () => {
    const result = mapEditionToOpds(
      makeEditionResult({
        work: {
          titleDisplay: "Test",
          sortTitle: null,
          description: null,
          coverPath: null,
          seriesPosition: null,
          series: null,
        },
      }),
    );
    expect(result.seriesName).toBeNull();
    expect(result.seriesPosition).toBeNull();
  });

  it("falls back to application/epub+zip when mimeType is null", () => {
    const result = mapEditionToOpds(
      makeEditionResult({
        editionFiles: [
          { id: "ef-1", fileAsset: { mimeType: null, sizeBytes: 1000n, basename: "test.epub" } },
        ],
      }),
    );
    expect(result.files[0]?.mimeType).toBe("application/epub+zip");
  });

  it("handles multiple files", () => {
    const result = mapEditionToOpds(
      makeEditionResult({
        editionFiles: [
          { id: "ef-1", fileAsset: { mimeType: "application/epub+zip", sizeBytes: 1000n, basename: "a.epub" } },
          { id: "ef-2", fileAsset: { mimeType: "application/pdf", sizeBytes: 2000n, basename: "a.pdf" } },
        ],
      }),
    );
    expect(result.files).toHaveLength(2);
  });
});
