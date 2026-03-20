import { describe, it, expect } from "vitest";
import { MediaKind } from "@bookhouse/domain";
import { deriveTitleFromPath } from "./filename-title";

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
