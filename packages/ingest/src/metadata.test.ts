import { describe, expect, it } from "vitest";
import { createIdentifierMap, normalizeBookMetadata, normalizeOpfMetadata } from "./index";
import { METADATA_INTERNALS, normalizeAudiobookMetadata } from "./metadata";
import type { ParsedAudiobookMetadataJsonRaw, ParsedAudioId3TagsRaw } from "./audiobook";

describe("metadata normalization", () => {
  it("normalizes whitespace and deduplicates authors", () => {
    expect(
      normalizeBookMetadata({
        authors: ["  N. K. Jemisin  ", "N. K.  Jemisin", ""],
        identifiers: [],
        title: "  The   Fifth   Season  ",
      }),
    ).toEqual({
      authors: ["N. K. Jemisin"],
      identifiers: { unknown: [] },
      title: "The Fifth Season",
    });
  });

  it("classifies ISBNs, ASINs, and preserves deduplicated unknown identifiers", () => {
    expect(
      createIdentifierMap([
        { scheme: "ISBN", value: "978-0-316-49883-4" },
        { scheme: "isbn-10", value: "0316499015" },
        { scheme: "ASIN", value: "b012345678" },
        { scheme: "uuid", value: " urn:uuid:abc " },
        { value: "urn:uuid:abc" },
      ]),
    ).toEqual({
      asin: "B012345678",
      isbn10: "0316499015",
      isbn13: "9780316498834",
      unknown: ["urn:uuid:abc"],
    });
  });

  it("infers identifier types when schemes are absent", () => {
    expect(
      createIdentifierMap([
        { value: "9780316498834" },
        { value: "0-316-49901-5" },
        { value: "B012345678" },
      ]),
    ).toEqual({
      asin: "B012345678",
      isbn10: "0316499015",
      isbn13: "9780316498834",
      unknown: [],
    });
  });

  it("covers internal identifier normalization branches", () => {
    expect(METADATA_INTERNALS.classifyIdentifier({ scheme: "ISBN-10", value: "0316499015" })).toEqual({
      kind: "isbn10",
      value: "0316499015",
    });
    expect(METADATA_INTERNALS.classifyIdentifier({ scheme: "ISBN", value: "0316499015" })).toEqual({
      kind: "isbn10",
      value: "0316499015",
    });
    expect(METADATA_INTERNALS.classifyIdentifier({ scheme: "ISBN", value: "not-an-isbn" })).toEqual({
      kind: "unknown",
      value: "not-an-isbn",
    });
    expect(METADATA_INTERNALS.classifyIdentifier({ value: "   " })).toEqual({
      kind: "unknown",
      value: "",
    });
    expect(METADATA_INTERNALS.normalizeScheme(undefined)).toBeUndefined();
  });

  it("canonicalizes titles and contributors for exact work matching", () => {
    expect(METADATA_INTERNALS.canonicalizeBookTitle(" The, Fifth-Season! ")).toBe("the fifth season");
    expect(METADATA_INTERNALS.canonicalizeContributorName(" N. K. Jemisin ")).toBe("n k jemisin");
    expect(METADATA_INTERNALS.canonicalizeBookTitle(undefined)).toBeUndefined();
    expect(
      METADATA_INTERNALS.canonicalizeContributorNames([
        " N. K. Jemisin ",
        "n k jemisin",
        "N.K.  Jemisin",
        "!!!",
      ]),
    ).toEqual(["n k jemisin"]);
  });
});

describe("normalizeOpfMetadata", () => {
  it("normalizes authors, strips HTML from description, and maps extended fields", () => {
    const result = normalizeOpfMetadata({
      title: "  The Name of the Wind  ",
      authors: [
        { name: "  Patrick Rothfuss  ", fileAs: "Rothfuss, Patrick", role: "aut" },
        { name: "  Patrick Rothfuss  ", fileAs: "Rothfuss, Patrick", role: "aut" },
      ],
      identifiers: [{ scheme: "ISBN", value: "9780756404079" }],
      description: "<p>A story about <i>Kvothe</i>.</p>",
      subjects: ["Fantasy", "Adventure"],
      publisher: "  DAW Books  ",
      date: "2007-03-27",
      language: "en",
      series: { name: "The Kingkiller Chronicle", index: 1 },
    });

    expect(result.authors).toEqual(["Patrick Rothfuss"]);
    expect(result.title).toBe("The Name of the Wind");
    expect(result.description).toBe("A story about Kvothe.");
    expect(result.subjects).toEqual(["Fantasy", "Adventure"]);
    expect(result.publisher).toBe("DAW Books");
    expect(result.date).toBe("2007-03-27");
    expect(result.language).toBe("en");
    expect(result.series).toEqual({ name: "The Kingkiller Chronicle", index: 1 });
    expect(result.identifiers).toEqual({ isbn13: "9780756404079", unknown: [] });
  });

  it("returns undefined subjects when the subjects array is empty", () => {
    const result = normalizeOpfMetadata({
      authors: [],
      identifiers: [],
      subjects: [],
    });
    expect(result.subjects).toBeUndefined();
  });

  it("returns undefined description when raw description is absent", () => {
    const result = normalizeOpfMetadata({
      authors: [],
      identifiers: [],
      subjects: [],
      description: undefined,
    });
    expect(result.description).toBeUndefined();
  });

  it("returns undefined series when raw series is absent", () => {
    const result = normalizeOpfMetadata({
      authors: [],
      identifiers: [],
      subjects: [],
      series: undefined,
    });
    expect(result.series).toBeUndefined();
  });
});

describe("normalizeAudiobookMetadata", () => {
  const fullJson: ParsedAudiobookMetadataJsonRaw = {
    title: "  Project Hail Mary  ",
    subtitle: "A Novel",
    authors: ["  Andy Weir  ", "Andy Weir"],
    narrators: ["  Ray Porter  ", "Ray Porter"],
    series: [{ name: "Standalone", sequence: "1" }],
    publisher: "  Audible Studios  ",
    publishedYear: "2021",
    description: "  A lone astronaut must save the earth.  ",
    genres: ["Science Fiction", "Thriller"],
    language: "en",
    isbn: "9780593135204",
    asin: "B08GB58KD5",
  };

  it("normalizes all fields from metadata.json", () => {
    const result = normalizeAudiobookMetadata(fullJson);

    expect(result.title).toBe("Project Hail Mary");
    expect(result.authors).toEqual(["Andy Weir"]);
    expect(result.narrators).toEqual(["Ray Porter"]);
    expect(result.identifiers).toEqual({
      isbn13: "9780593135204",
      asin: "B08GB58KD5",
      unknown: [],
    });
    expect(result.description).toBe("A lone astronaut must save the earth.");
    expect(result.subjects).toEqual(["Science Fiction", "Thriller"]);
    expect(result.publisher).toBe("Audible Studios");
    expect(result.date).toBe("2021");
    expect(result.language).toBe("en");
    expect(result.series).toEqual({ name: "Standalone", index: 1 });
  });

  it("falls back to ID3 tags when metadata.json fields are missing", () => {
    const minimalJson: ParsedAudiobookMetadataJsonRaw = {
      title: "Minimal",
      authors: [],
      narrators: [],
      series: [],
      genres: [],
    };

    const id3: ParsedAudioId3TagsRaw = {
      title: "Chapter 01",
      artist: "Jane Author",
      albumArtist: "Jane Author",
      album: "The Great Book",
      year: 2020,
      genres: ["Fantasy"],
      comment: "A great story",
      trackNumber: 1,
      trackTotal: 10,
    };

    const result = normalizeAudiobookMetadata(minimalJson, id3);

    // title comes from json (not ID3 album)
    expect(result.title).toBe("Minimal");
    // authors fall back to ID3 albumArtist
    expect(result.authors).toEqual(["Jane Author"]);
    // genres fall back to ID3
    expect(result.subjects).toEqual(["Fantasy"]);
    // year falls back to ID3
    expect(result.date).toBe("2020");
  });

  it("prefers metadata.json over ID3 tags for conflicting fields", () => {
    const id3: ParsedAudioId3TagsRaw = {
      title: "ID3 Title",
      artist: "ID3 Artist",
      albumArtist: "ID3 Album Artist",
      album: "ID3 Album",
      year: 1999,
      genres: ["ID3 Genre"],
      comment: undefined,
      trackNumber: undefined,
      trackTotal: undefined,
    };

    const result = normalizeAudiobookMetadata(fullJson, id3);

    expect(result.title).toBe("Project Hail Mary");
    expect(result.authors).toEqual(["Andy Weir"]);
    expect(result.subjects).toEqual(["Science Fiction", "Thriller"]);
    expect(result.date).toBe("2021");
  });

  it("falls back to ID3 artist when albumArtist is absent", () => {
    const minimalJson: ParsedAudiobookMetadataJsonRaw = {
      title: "Test",
      authors: [],
      narrators: [],
      series: [],
      genres: [],
    };

    const id3: ParsedAudioId3TagsRaw = {
      title: undefined,
      artist: "Artist Only",
      albumArtist: undefined,
      album: undefined,
      year: undefined,
      genres: [],
      comment: undefined,
      trackNumber: undefined,
      trackTotal: undefined,
    };

    const result = normalizeAudiobookMetadata(minimalJson, id3);
    expect(result.authors).toEqual(["Artist Only"]);
  });

  it("returns empty narrators when none provided", () => {
    const result = normalizeAudiobookMetadata({
      title: "Test",
      authors: ["Author"],
      narrators: [],
      series: [],
      genres: [],
    });

    expect(result.narrators).toEqual([]);
  });

  it("returns undefined for optional fields when not present", () => {
    const result = normalizeAudiobookMetadata({
      title: "Test",
      authors: [],
      narrators: [],
      series: [],
      genres: [],
    });

    expect(result.description).toBeUndefined();
    expect(result.subjects).toBeUndefined();
    expect(result.publisher).toBeUndefined();
    expect(result.date).toBeUndefined();
    expect(result.language).toBeUndefined();
    expect(result.series).toBeUndefined();
  });

  it("handles isbn10 identifiers", () => {
    const result = normalizeAudiobookMetadata({
      title: "Test",
      authors: [],
      narrators: [],
      series: [],
      genres: [],
      isbn: "0316499015",
    });

    expect(result.identifiers.isbn10).toBe("0316499015");
  });

  it("handles non-numeric series sequence gracefully", () => {
    const result = normalizeAudiobookMetadata({
      title: "Test",
      authors: [],
      narrators: [],
      series: [{ name: "My Series", sequence: "not-a-number" }],
      genres: [],
    });

    expect(result.series).toEqual({ name: "My Series", index: undefined });
  });

  it("deduplicates narrators with whitespace normalization", () => {
    const result = normalizeAudiobookMetadata({
      title: "Test",
      authors: [],
      narrators: ["  Ray Porter  ", "Ray  Porter", "Other Narrator"],
      series: [],
      genres: [],
    });

    expect(result.narrators).toEqual(["Ray Porter", "Other Narrator"]);
  });

  it("handles ID3-only year fallback with no ID3 provided", () => {
    const result = normalizeAudiobookMetadata({
      title: "Test",
      authors: [],
      narrators: [],
      series: [],
      genres: [],
    });

    expect(result.date).toBeUndefined();
  });
});
