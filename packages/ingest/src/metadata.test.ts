import { describe, expect, it } from "vitest";
import { createIdentifierMap, normalizeBookMetadata } from "./index";
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
