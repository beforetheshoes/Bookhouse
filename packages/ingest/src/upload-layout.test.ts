import path from "node:path";
import { describe, expect, it } from "vitest";
import { MediaKind } from "@bookhouse/domain";
import {
  buildBookFolderPath,
  chooseSidecarKind,
  sanitizeFolderSegment,
} from "./upload-layout";

describe("sanitizeFolderSegment", () => {
  it("strips path separators", () => {
    expect(sanitizeFolderSegment("foo/bar")).toBe("foo bar");
    expect(sanitizeFolderSegment("foo\\bar")).toBe("foo bar");
  });

  it("removes parent-directory traversal sequences", () => {
    expect(sanitizeFolderSegment("..")).toBe("");
    expect(sanitizeFolderSegment("../etc/passwd")).toBe("etc passwd");
    expect(sanitizeFolderSegment("foo/../bar")).toBe("foo bar");
  });

  it("strips control characters", () => {
    expect(sanitizeFolderSegment("foo\x00bar")).toBe("foo bar");
    expect(sanitizeFolderSegment("foo\tbar\nbaz")).toBe("foo bar baz");
    expect(sanitizeFolderSegment("foo\x1fbar")).toBe("foo bar");
    expect(sanitizeFolderSegment("foo\x7fbar")).toBe("foo bar");
  });

  it("trims leading and trailing dots and whitespace", () => {
    expect(sanitizeFolderSegment("  .foo. ")).toBe("foo");
    expect(sanitizeFolderSegment("....")).toBe("");
  });

  it("collapses internal whitespace runs to single spaces", () => {
    expect(sanitizeFolderSegment("foo   bar")).toBe("foo bar");
  });

  it("truncates to 120 characters", () => {
    const long = "a".repeat(200);
    expect(sanitizeFolderSegment(long)).toHaveLength(120);
  });

  it("preserves unicode letters and punctuation", () => {
    expect(sanitizeFolderSegment("Émile Zola")).toBe("Émile Zola");
    expect(sanitizeFolderSegment("村上 春樹")).toBe("村上 春樹");
    expect(sanitizeFolderSegment("Brontë, Charlotte")).toBe("Brontë, Charlotte");
  });

  it("preserves common safe punctuation but strips Windows/HFS unsafe chars", () => {
    // Colons are unsafe on macOS HFS and Windows; quotes/pipes/etc. are
    // Windows-reserved. Ampersand, parentheses, dashes are fine.
    expect(sanitizeFolderSegment("Foo: Bar & Baz (2020)")).toBe(
      "Foo Bar & Baz (2020)",
    );
    expect(sanitizeFolderSegment('Foo"Bar')).toBe("Foo Bar");
    expect(sanitizeFolderSegment("Foo|Bar")).toBe("Foo Bar");
    expect(sanitizeFolderSegment("Foo?Bar*Baz")).toBe("Foo Bar Baz");
    expect(sanitizeFolderSegment("Foo<Bar>Baz")).toBe("Foo Bar Baz");
  });

  it("returns empty string when input has only unsafe characters", () => {
    expect(sanitizeFolderSegment("///")).toBe("");
    expect(sanitizeFolderSegment("")).toBe("");
  });

  it("does not return the reserved names '.' or '..'", () => {
    expect(sanitizeFolderSegment(".")).toBe("");
    expect(sanitizeFolderSegment("..")).toBe("");
  });
});

describe("buildBookFolderPath", () => {
  it("composes libraryRoot/author/title with sanitisation", () => {
    expect(
      buildBookFolderPath({
        libraryRootPath: "/data/ebooks",
        author: "Brandon Sanderson",
        title: "Mistborn: The Final Empire",
      }),
    ).toBe(path.join("/data/ebooks", "Brandon Sanderson", "Mistborn The Final Empire"));
  });

  it("rejects empty author after sanitisation", () => {
    expect(() =>
      buildBookFolderPath({
        libraryRootPath: "/data/ebooks",
        author: "  /  ",
        title: "Valid Title",
      }),
    ).toThrow(/author/i);
  });

  it("rejects empty title after sanitisation", () => {
    expect(() =>
      buildBookFolderPath({
        libraryRootPath: "/data/ebooks",
        author: "Valid Author",
        title: "..",
      }),
    ).toThrow(/title/i);
  });

  it("keeps traversal-style inputs contained inside the library root", () => {
    const result = buildBookFolderPath({
      libraryRootPath: "/data/ebooks",
      author: "../../../etc",
      title: "passwd",
    });
    expect(result.startsWith(path.resolve("/data/ebooks") + path.sep)).toBe(true);
  });

  it("normalises the library root path", () => {
    expect(
      buildBookFolderPath({
        libraryRootPath: "/data/ebooks/",
        author: "Author",
        title: "Title",
      }),
    ).toBe(path.join("/data/ebooks", "Author", "Title"));
  });
});

describe("chooseSidecarKind", () => {
  it("returns 'opf' for ebook media kinds", () => {
    expect(chooseSidecarKind(MediaKind.EPUB)).toBe("opf");
    expect(chooseSidecarKind(MediaKind.KEPUB)).toBe("opf");
    expect(chooseSidecarKind(MediaKind.PDF)).toBe("opf");
    expect(chooseSidecarKind(MediaKind.MOBI)).toBe("opf");
    expect(chooseSidecarKind(MediaKind.AZW)).toBe("opf");
    expect(chooseSidecarKind(MediaKind.AZW3)).toBe("opf");
    expect(chooseSidecarKind(MediaKind.CBZ)).toBe("opf");
  });

  it("returns 'json' for audiobook media kinds", () => {
    expect(chooseSidecarKind(MediaKind.AUDIO)).toBe("json");
  });

  it("throws for non-book media kinds", () => {
    expect(() => chooseSidecarKind(MediaKind.COVER)).toThrow();
    expect(() => chooseSidecarKind(MediaKind.SIDECAR)).toThrow();
    expect(() => chooseSidecarKind(MediaKind.OTHER)).toThrow();
  });
});
