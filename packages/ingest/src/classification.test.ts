import path from "node:path";
import { describe, expect, it } from "vitest";
import { MediaKind } from "@bookhouse/domain";
import { FormatFamily } from "@bookhouse/domain";
import {
  classifyMediaKind,
  deriveFormatFamily,
  getFileExtension,
  normalizeRelativePath,
  normalizeRootPath,
} from "./index";

describe("classification helpers", () => {
  it("normalizes root paths and relative file paths", () => {
    const rootPath = normalizeRootPath("/tmp/books/../books");

    expect(rootPath).toBe(path.resolve("/tmp/books"));
    expect(normalizeRelativePath(rootPath, "/tmp/books/author/title.epub")).toBe(
      path.join("author", "title.epub"),
    );
  });

  it("rejects files outside the library root", () => {
    expect(() =>
      normalizeRelativePath("/tmp/books", "/tmp/other/book.epub"),
    ).toThrow('File path "/tmp/other/book.epub" is outside library root "/tmp/books"');
  });

  it("returns lowercase file extensions or null", () => {
    expect(getFileExtension("/tmp/books/Title.EPUB")).toBe("epub");
    expect(getFileExtension("/tmp/books/README")).toBeNull();
  });

  it("derives format family from media kind", () => {
    expect(deriveFormatFamily(MediaKind.EPUB)).toBe(FormatFamily.EBOOK);
    expect(deriveFormatFamily(MediaKind.PDF)).toBe(FormatFamily.EBOOK);
    expect(deriveFormatFamily(MediaKind.CBZ)).toBe(FormatFamily.EBOOK);
    expect(deriveFormatFamily(MediaKind.AUDIO)).toBe(FormatFamily.AUDIOBOOK);
    expect(deriveFormatFamily(MediaKind.COVER)).toBeNull();
    expect(deriveFormatFamily(MediaKind.SIDECAR)).toBeNull();
    expect(deriveFormatFamily(MediaKind.OTHER)).toBeNull();
  });

  it("classifies supported media kinds", () => {
    expect(classifyMediaKind("book.epub")).toBe(MediaKind.EPUB);
    expect(classifyMediaKind("book.pdf")).toBe(MediaKind.PDF);
    expect(classifyMediaKind("book.cbz")).toBe(MediaKind.CBZ);
    expect(classifyMediaKind("track.m4b")).toBe(MediaKind.AUDIO);
    expect(classifyMediaKind("cover.jpg")).toBe(MediaKind.COVER);
    expect(classifyMediaKind("metadata.xml")).toBe(MediaKind.SIDECAR);
    expect(classifyMediaKind("archive.bin")).toBe(MediaKind.OTHER);
  });
});
