import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildEntitlement, buildBookMetadata, buildContentUrls, toKoboId } from "./metadata";
import type { EligibleEdition } from "./types";
import type { MetadataOptions } from "./metadata";

const mockEdition: EligibleEdition = {
  id: "ed-1",
  workId: "wk-1",
  title: "Test Book",
  description: "A test book description",
  coverPath: "/covers/test.jpg",
  publisher: "Test Publisher",
  publishedAt: new Date("2024-06-15"),
  isbn13: "9781234567890",
  language: "en",
  pageCount: 300,
  seriesName: "Test Series",
  seriesPosition: 2,
  contributors: [
    { name: "Jane Author", role: "AUTHOR" },
    { name: "Bob Narrator", role: "NARRATOR" },
  ],
  primaryFilePath: "/books/test.epub",
  primaryFileSize: 1024000,
  primaryFileMimeType: "application/epub+zip",
};

const options: MetadataOptions = {
  baseUrl: "http://localhost:3000",
  deviceToken: "abc123",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("toKoboId", () => {
  it("returns a valid UUID string", () => {
    expect(toKoboId("ed-1")).toMatch(UUID_REGEX);
  });

  it("is deterministic — same input produces same UUID", () => {
    expect(toKoboId("ed-1")).toBe(toKoboId("ed-1"));
  });

  it("produces different UUIDs for different inputs", () => {
    expect(toKoboId("ed-1")).not.toBe(toKoboId("ed-2"));
    expect(toKoboId("ed-1")).not.toBe(toKoboId("wk-1"));
  });
});

describe("buildEntitlement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a valid entitlement object", () => {
    const result = buildEntitlement(mockEdition, options);

    expect(result.BookEntitlement.Id).toBe("ed-1");
    expect(result.BookEntitlement.IsRemoved).toBe(false);
    expect(result.BookEntitlement.OriginCategory).toBe("Imported");
    expect(result.BookEntitlement.Status).toBe("Active");
    expect(result.BookEntitlement.ActivePeriod.From).toBe(
      "2024-06-15T00:00:00.000Z",
    );
    expect(result.BookMetadata.Title).toBe("Test Book");
  });

  it("uses current time when publishedAt is null", () => {
    const edition = { ...mockEdition, publishedAt: null };
    const result = buildEntitlement(edition, options);

    expect(result.BookEntitlement.ActivePeriod.From).toBe(
      "2024-07-01T00:00:00.000Z",
    );
  });

  it("sets empty publisher when null", () => {
    const edition = { ...mockEdition, publisher: null };
    const result = buildEntitlement(edition, options);
    expect(result.BookMetadata.Publisher.Name).toBe("");
  });

  it("has expected static fields", () => {
    const result = buildEntitlement(mockEdition, options);
    expect(result.BookEntitlement.Accessibility).toBe("Full");
    expect(result.BookEntitlement.IsLocked).toBe(false);
    expect(result.BookEntitlement.IsHiddenFromArchive).toBe(false);
    expect(result.BookEntitlement.OriginCategory).toBe("Imported");
    expect(result.BookEntitlement.Status).toBe("Active");
    expect(result.BookMetadata.CurrentDisplayPrice.TotalAmount).toBe(0);
    expect(result.BookMetadata.CurrentLoveDisplayPrice.TotalAmount).toBe(0);
    expect(result.BookMetadata.PhoneticPronunciations).toEqual({});
    expect(result.BookMetadata.IsPreOrder).toBe(false);
    expect(result.BookMetadata.ExternalIds).toEqual([]);
  });

  it("includes ReadingState with ReadyToRead status", () => {
    const result = buildEntitlement(mockEdition, options);
    expect(result.ReadingState.EntitlementId).toBe("ed-1");
    expect(result.ReadingState.Created).toBe("2024-07-01T00:00:00.000Z");
    expect(result.ReadingState.LastModified).toBe("2024-07-01T00:00:00.000Z");
    expect(result.ReadingState.PriorityTimestamp).toBe("2024-07-01T00:00:00.000Z");
    expect(result.ReadingState.StatusInfo.Status).toBe("ReadyToRead");
    expect(result.ReadingState.StatusInfo.TimesStartedReading).toBe(0);
    expect(result.ReadingState.Statistics.LastModified).toBe("2024-07-01T00:00:00.000Z");
    expect(result.ReadingState.CurrentBookmark.LastModified).toBe("2024-07-01T00:00:00.000Z");
  });

  it("does not include ContentUrls inside the entitlement", () => {
    const result = buildEntitlement(mockEdition, options);
    expect(result).not.toHaveProperty("ContentUrls");
  });
});

describe("buildBookMetadata", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps contributors", () => {
    const meta = buildBookMetadata(mockEdition, options);
    expect(meta.ContributorRoles).toEqual([
      { Name: "Jane Author" },
      { Name: "Bob Narrator" },
    ]);
    expect(meta.Contributors).toEqual(["Jane Author", "Bob Narrator"]);
  });

  it("builds download URLs when file exists", () => {
    const meta = buildBookMetadata(mockEdition, options);
    expect(meta.DownloadUrls).toHaveLength(1);
    const dl = meta.DownloadUrls.at(0);
    expect(dl).toBeDefined();
    expect(dl?.Url).toBe(
      "http://localhost:3000/kobo/abc123/v1/library/ed-1/download",
    );
    expect(dl?.DRMType).toBe("None");
    expect(dl?.Format).toBe("KEPUB");
    expect(dl?.Size).toBe(1024000);
    expect(dl?.Platform).toBe("Generic");
  });

  it("returns empty download URLs when no file", () => {
    const edition = { ...mockEdition, primaryFilePath: null };
    const meta = buildBookMetadata(edition, options);
    expect(meta.DownloadUrls).toEqual([]);
  });

  it("includes series info when present", () => {
    const meta = buildBookMetadata(mockEdition, options);
    expect(meta.Series).toEqual({
      Name: "Test Series",
      Number: 2,
      NumberFloat: 2,
      Id: "series-wk-1",
    });
  });

  it("omits series when not present", () => {
    const edition = { ...mockEdition, seriesName: null, seriesPosition: null };
    const meta = buildBookMetadata(edition, options);
    expect(meta.Series).toBeUndefined();
  });

  it("uses defaults for null fields", () => {
    const edition = {
      ...mockEdition,
      description: null,
      language: null,
      publisher: null,
      publishedAt: null,
      primaryFileSize: null,
    };
    const meta = buildBookMetadata(edition, options);
    expect(meta.Description).toBe("");
    expect(meta.Language).toBe("en");
    expect(meta.Publisher.Name).toBe("");
    expect(meta.PublicationDate).toBe("2024-07-01T00:00:00.000Z");
    expect(meta.DownloadUrls.at(0)?.Size).toBe(0);
  });

  it("sets static fields correctly", () => {
    const meta = buildBookMetadata(mockEdition, options);
    expect(meta.IsSocialEnabled).toBe(false);
    expect(meta.IsInternetArchive).toBe(false);
    expect(meta.IsEligibleForKoboLove).toBe(false);
    expect(meta.Categories).toEqual(["00000000-0000-0000-0000-000000000001"]);
    expect(meta.CoverImageId).toBe("ed-1-v3");
    expect(meta.CrossRevisionId).toBe("ed-1");
    expect(meta.WorkId).toBe("wk-1");
    expect(meta.Genre).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("handles seriesPosition null with seriesName present", () => {
    const edition = { ...mockEdition, seriesPosition: null };
    const meta = buildBookMetadata(edition, options);
    expect(meta.Series).toEqual({
      Name: "Test Series",
      Number: 0,
      NumberFloat: 0,
      Id: "series-wk-1",
    });
  });
});

describe("buildContentUrls", () => {
  it("builds cover URLs with correct paths", () => {
    const urls = buildContentUrls("ed-1", options);
    expect(urls.BookCover).toBe(
      "http://localhost:3000/kobo/abc123/v1/library/ed-1/cover",
    );
    expect(urls.BookCoverThumbnail).toBe(
      "http://localhost:3000/kobo/abc123/v1/library/ed-1/cover",
    );
  });
});
