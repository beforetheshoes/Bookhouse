import { describe, it, expect } from "vitest";
import { MediaKind } from "@bookhouse/domain";
import { deriveTitleFromPath, stripFilenameAuthorSuffix } from "./filename-title";

describe("deriveTitleFromPath", () => {
  it("strips extension from epub filename", () => {
    const result = deriveTitleFromPath("The Name of the Wind.epub", MediaKind.EPUB);
    expect(result.title).toBe("The Name of the Wind");
  });

  it("replaces underscores with spaces", () => {
    const result = deriveTitleFromPath("some_book_title.pdf", MediaKind.PDF);
    expect(result.title).toBe("some book title");
  });

  it("replaces hyphens surrounded by spaces", () => {
    const result = deriveTitleFromPath("Title - Author Name.epub", MediaKind.EPUB);
    expect(result.title).toBe("Title - Author Name");
  });

  it("replaces standalone hyphens in filenames without spaces", () => {
    const result = deriveTitleFromPath("some-book-title.cbz", MediaKind.CBZ);
    expect(result.title).toBe("some book title");
  });

  it("uses parent directory name for audio files", () => {
    const result = deriveTitleFromPath("Patrick Rothfuss/The Name of the Wind/01-chapter1.mp3", MediaKind.AUDIO);
    expect(result.title).toBe("The Name of the Wind");
  });

  it("falls back to basename for audio file at root level", () => {
    const result = deriveTitleFromPath("audiobook.mp3", MediaKind.AUDIO);
    expect(result.title).toBe("audiobook");
  });

  it("handles nested ebook paths by using basename", () => {
    const result = deriveTitleFromPath("Fiction/Author/My Great Book.epub", MediaKind.EPUB);
    expect(result.title).toBe("My Great Book");
  });

  it("provides a canonical title", () => {
    const result = deriveTitleFromPath("  The Name of the Wind.epub  ", MediaKind.EPUB);
    expect(result.titleCanonical).toBe("the name of the wind");
  });

  it("handles file with no extension", () => {
    const result = deriveTitleFromPath("somefile", MediaKind.EPUB);
    expect(result.title).toBe("somefile");
  });

  it("trims whitespace from result", () => {
    const result = deriveTitleFromPath("  spaced  .epub", MediaKind.EPUB);
    expect(result.title).toBe("spaced");
  });

  it("falls back to lowercase title when canonical is empty", () => {
    const result = deriveTitleFromPath("....epub", MediaKind.EPUB);
    expect(result.title).toBe("...");
    expect(result.titleCanonical).toBe("...");
  });
});

describe("stripFilenameAuthorSuffix", () => {
  it("strips en-dash author suffix (Calibre convention)", () => {
    expect(stripFilenameAuthorSuffix("Hacking the Xbox \u2013 Andrew Huang")).toBe("Hacking the Xbox");
  });

  it("strips em-dash author suffix", () => {
    expect(stripFilenameAuthorSuffix("Sapiens \u2014 Yuval Noah Harari")).toBe("Sapiens");
  });

  it("strips hyphen-dash author suffix", () => {
    expect(stripFilenameAuthorSuffix("The Name of the Wind - Patrick Rothfuss")).toBe("The Name of the Wind");
  });

  it("preserves hyphen-dash subtitle starting with 'The'", () => {
    expect(stripFilenameAuthorSuffix("Working in Public - The Making of Open Source")).toBe("Working in Public - The Making of Open Source");
  });

  it("preserves hyphen-dash subtitle starting with 'A'", () => {
    expect(stripFilenameAuthorSuffix("Sapiens - A Brief History of Humankind")).toBe("Sapiens - A Brief History of Humankind");
  });

  it("preserves hyphen-dash subtitle starting with 'An'", () => {
    expect(stripFilenameAuthorSuffix("Collapse - An Inquiry into Systems")).toBe("Collapse - An Inquiry into Systems");
  });

  it("preserves hyphen-dash subtitle starting with 'How'", () => {
    expect(stripFilenameAuthorSuffix("Thinking Fast - How We Decide")).toBe("Thinking Fast - How We Decide");
  });

  it("returns title unchanged when no dash separator exists", () => {
    expect(stripFilenameAuthorSuffix("Title")).toBe("Title");
  });

  it("does not strip non-spaced hyphens", () => {
    expect(stripFilenameAuthorSuffix("A-Hyphenated-Title")).toBe("A-Hyphenated-Title");
  });

  it("handles multiple en-dashes by stripping from the last one", () => {
    expect(stripFilenameAuthorSuffix("Part One \u2013 Part Two \u2013 Author")).toBe("Part One \u2013 Part Two");
  });

  it("handles empty suffix after dash gracefully", () => {
    expect(stripFilenameAuthorSuffix("Title \u2013 ")).toBe("Title");
  });
});
