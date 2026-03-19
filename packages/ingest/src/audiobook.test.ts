import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("music-metadata", () => ({
  parseFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { parseFile } from "music-metadata";
import {
  parseAudiobookMetadataJson,
  parseAudioId3Tags,
  type ParsedAudiobookMetadataJsonRaw,
  type ParsedAudioId3TagsRaw,
} from "./audiobook";

const mockedReadFile = vi.mocked(readFile);
const mockedParseFile = vi.mocked(parseFile);

const FULL_METADATA_JSON: ParsedAudiobookMetadataJsonRaw = {
  title: "Project Hail Mary",
  subtitle: "A Novel",
  authors: ["Andy Weir"],
  narrators: ["Ray Porter"],
  series: [{ name: "Standalone", sequence: "1" }],
  publisher: "Audible Studios",
  publishedYear: "2021",
  description: "A lone astronaut must save the earth.",
  genres: ["Science Fiction", "Thriller"],
  language: "en",
  isbn: "9780593135204",
  asin: "B08GB58KD5",
};

describe("parseAudiobookMetadataJson", () => {
  it("parses a complete metadata.json file", async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(FULL_METADATA_JSON));

    const result = await parseAudiobookMetadataJson("/books/Andy Weir/Project Hail Mary/metadata.json");

    expect(result).toEqual(FULL_METADATA_JSON);
    expect(mockedReadFile).toHaveBeenCalledWith(
      "/books/Andy Weir/Project Hail Mary/metadata.json",
      "utf8",
    );
  });

  it("parses metadata.json with only required fields", async () => {
    const minimal = { title: "Minimal Book" };
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(minimal));

    const result = await parseAudiobookMetadataJson("/books/metadata.json");

    expect(result.title).toBe("Minimal Book");
    expect(result.authors).toEqual([]);
    expect(result.narrators).toEqual([]);
    expect(result.series).toEqual([]);
    expect(result.genres).toEqual([]);
    expect(result.subtitle).toBeUndefined();
    expect(result.publisher).toBeUndefined();
    expect(result.publishedYear).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.language).toBeUndefined();
    expect(result.isbn).toBeUndefined();
    expect(result.asin).toBeUndefined();
  });

  it("throws when title is missing", async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify({ authors: ["Nobody"] }));

    await expect(
      parseAudiobookMetadataJson("/books/metadata.json"),
    ).rejects.toThrow("metadata.json missing required field: title");
  });

  it("throws on malformed JSON", async () => {
    mockedReadFile.mockResolvedValueOnce("not json {{{");

    await expect(
      parseAudiobookMetadataJson("/books/metadata.json"),
    ).rejects.toThrow();
  });

  it("throws when content is not an object", async () => {
    mockedReadFile.mockResolvedValueOnce('"just a string"');

    await expect(
      parseAudiobookMetadataJson("/books/metadata.json"),
    ).rejects.toThrow("metadata.json content is not an object");
  });

  it("throws when title is not a string", async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify({ title: 123 }));

    await expect(
      parseAudiobookMetadataJson("/books/metadata.json"),
    ).rejects.toThrow("metadata.json missing required field: title");
  });

  it("coerces non-array authors to empty array", async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify({ title: "Test", authors: "single author" }));

    const result = await parseAudiobookMetadataJson("/books/metadata.json");
    expect(result.authors).toEqual([]);
  });

  it("coerces non-array narrators to empty array", async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify({ title: "Test", narrators: "single narrator" }));

    const result = await parseAudiobookMetadataJson("/books/metadata.json");
    expect(result.narrators).toEqual([]);
  });

  it("coerces non-array series to empty array", async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify({ title: "Test", series: "not array" }));

    const result = await parseAudiobookMetadataJson("/books/metadata.json");
    expect(result.series).toEqual([]);
  });

  it("coerces non-array genres to empty array", async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify({ title: "Test", genres: 42 }));

    const result = await parseAudiobookMetadataJson("/books/metadata.json");
    expect(result.genres).toEqual([]);
  });

  it("filters non-string entries from string arrays", async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify({
      title: "Test",
      authors: ["Valid", 123, null, "Also Valid"],
      narrators: [true, "Good Narrator"],
      genres: ["Sci-Fi", undefined, "Fantasy"],
    }));

    const result = await parseAudiobookMetadataJson("/books/metadata.json");
    expect(result.authors).toEqual(["Valid", "Also Valid"]);
    expect(result.narrators).toEqual(["Good Narrator"]);
    expect(result.genres).toEqual(["Sci-Fi", "Fantasy"]);
  });

  it("propagates file read errors", async () => {
    mockedReadFile.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    await expect(
      parseAudiobookMetadataJson("/missing/metadata.json"),
    ).rejects.toThrow("ENOENT");
  });
});

describe("parseAudioId3Tags", () => {
  it("extracts relevant fields from music-metadata output", async () => {
    mockedParseFile.mockResolvedValueOnce({
      common: {
        title: "Chapter 01",
        artist: "Andy Weir",
        albumartist: "Andy Weir",
        album: "Project Hail Mary",
        year: 2021,
        genre: ["Science Fiction"],
        comment: [{ text: "A great audiobook" }],
        track: { no: 1, of: 12 },
      },
      format: {},
      native: {},
      quality: { warnings: [] },
    } as never);

    const result = await parseAudioId3Tags("/books/chapter01.mp3");

    expect(result).toEqual({
      title: "Chapter 01",
      artist: "Andy Weir",
      albumArtist: "Andy Weir",
      album: "Project Hail Mary",
      year: 2021,
      genres: ["Science Fiction"],
      comment: "A great audiobook",
      trackNumber: 1,
      trackTotal: 12,
    } satisfies ParsedAudioId3TagsRaw);
  });

  it("handles minimal metadata (all fields optional)", async () => {
    mockedParseFile.mockResolvedValueOnce({
      common: { track: { no: null, of: null } },
      format: {},
      native: {},
      quality: { warnings: [] },
    } as never);

    const result = await parseAudioId3Tags("/books/audio.m4b");

    expect(result).toEqual({
      title: undefined,
      artist: undefined,
      albumArtist: undefined,
      album: undefined,
      year: undefined,
      genres: [],
      comment: undefined,
      trackNumber: undefined,
      trackTotal: undefined,
    } satisfies ParsedAudioId3TagsRaw);
  });

  it("takes first comment from array", async () => {
    mockedParseFile.mockResolvedValueOnce({
      common: {
        comment: [{ text: "first" }, { text: "second" }],
        track: { no: null, of: null },
      },
      format: {},
      native: {},
      quality: { warnings: [] },
    } as never);

    const result = await parseAudioId3Tags("/books/audio.mp3");
    expect(result.comment).toBe("first");
  });

  it("handles empty comment array", async () => {
    mockedParseFile.mockResolvedValueOnce({
      common: {
        comment: [],
        track: { no: null, of: null },
      },
      format: {},
      native: {},
      quality: { warnings: [] },
    } as never);

    const result = await parseAudioId3Tags("/books/audio.mp3");
    expect(result.comment).toBeUndefined();
  });

  it("handles missing track info", async () => {
    mockedParseFile.mockResolvedValueOnce({
      common: {
        track: { no: null, of: null },
      },
      format: {},
      native: {},
      quality: { warnings: [] },
    } as never);

    const result = await parseAudioId3Tags("/books/audio.mp3");
    expect(result.trackNumber).toBeUndefined();
    expect(result.trackTotal).toBeUndefined();
  });

  it("propagates parse errors", async () => {
    mockedParseFile.mockRejectedValueOnce(new Error("Unsupported format"));

    await expect(
      parseAudioId3Tags("/books/audio.wav"),
    ).rejects.toThrow("Unsupported format");
  });
});
