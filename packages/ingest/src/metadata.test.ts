import { describe, expect, it } from "vitest";
import { createIdentifierMap, normalizeBookMetadata, normalizeOpfMetadata } from "./index";
import { METADATA_INTERNALS } from "./metadata";

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
