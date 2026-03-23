import { describe, it, expect } from "vitest";
import {
  levenshteinDistance,
  normalizedSimilarity,
  normalizeForTitleMatching,
  stripSubtitleForMatching,
} from "./similarity";

describe("levenshteinDistance", () => {
  it("returns 3 for kitten → sitting", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("returns length of non-empty string when other is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("handles single character difference", () => {
    expect(levenshteinDistance("a", "b")).toBe(1);
  });

  it("handles insertion only", () => {
    expect(levenshteinDistance("abc", "abcd")).toBe(1);
  });

  it("handles deletion only", () => {
    expect(levenshteinDistance("abcd", "abc")).toBe(1);
  });
});

describe("normalizedSimilarity", () => {
  it("returns approximately 0.571 for kitten vs sitting", () => {
    expect(normalizedSimilarity("kitten", "sitting")).toBeCloseTo(1 - 3 / 7, 3);
  });

  it("returns 1.0 for identical strings", () => {
    expect(normalizedSimilarity("abc", "abc")).toBe(1.0);
  });

  it("returns 1.0 for two empty strings", () => {
    expect(normalizedSimilarity("", "")).toBe(1.0);
  });

  it("returns 0.0 for completely different single characters", () => {
    expect(normalizedSimilarity("a", "b")).toBe(0.0);
  });

  it("returns high similarity for close strings", () => {
    const result = normalizedSimilarity("the great gatsby", "the great gatspy");
    expect(result).toBeGreaterThan(0.85);
  });

  it("returns low similarity for very different strings", () => {
    const result = normalizedSimilarity("hello", "world");
    expect(result).toBeLessThan(0.5);
  });
});

describe("normalizeForTitleMatching", () => {
  it("returns canonical form unchanged when no noise to strip", () => {
    expect(normalizeForTitleMatching("The Great Gatsby")).toBe("the great gatsby");
  });

  it("strips trailing parenthetical narrator name", () => {
    expect(normalizeForTitleMatching("The Dispossessed (Leslie)")).toBe("the dispossessed");
  });

  it("strips trailing (Unabridged)", () => {
    expect(normalizeForTitleMatching("Someone Comes to Town, Someone Leaves Town (Unabridged)")).toBe(
      "someone comes to town someone leaves town",
    );
  });

  it("strips trailing (GraphicAudio)", () => {
    expect(normalizeForTitleMatching("A Court of Frost and Starlight (GraphicAudio)")).toBe(
      "a court of frost and starlight",
    );
  });

  it("strips trailing series info in parentheses", () => {
    expect(normalizeForTitleMatching("Death's End (The Three-Body Problem Series Book 3)")).toBe(
      "death s end",
    );
  });

  it("strips ': A Novel' suffix", () => {
    expect(normalizeForTitleMatching("Unsheltered: A Novel")).toBe("unsheltered");
  });

  it("strips '- A Novel' suffix", () => {
    expect(normalizeForTitleMatching("Walkaway - A Novel")).toBe("walkaway");
  });

  it("strips trailing 'A Novel' without delimiter", () => {
    expect(normalizeForTitleMatching("Sourdough A Novel")).toBe("sourdough");
  });

  it("strips ': A Novel in Dramatic Form' suffix", () => {
    expect(normalizeForTitleMatching("The Sunset Limited: A Novel in Dramatic Form")).toBe(
      "the sunset limited",
    );
  });

  it("strips parenthetical first then A Novel suffix", () => {
    expect(normalizeForTitleMatching("Sourdough A Novel (Unabridged)")).toBe("sourdough");
  });

  it("strips trailing M4B file format", () => {
    expect(normalizeForTitleMatching("The Seven Principles for Making Marriage Work M4B")).toBe(
      "the seven principles for making marriage work",
    );
  });

  it("strips trailing (M4B) in parentheses", () => {
    expect(normalizeForTitleMatching("Working in Public - Nadia Eghbal (M4B)")).toBe(
      "working in public nadia eghbal",
    );
  });

  it("strips trailing m4b case-insensitively", () => {
    expect(
      normalizeForTitleMatching("Don't Build, Rebuild - The Case for Imaginative Reuse in Architecture m4b"),
    ).toBe("don t build rebuild the case for imaginative reuse in architecture");
  });

  it("strips edition markers like '10th Anniversary'", () => {
    expect(normalizeForTitleMatching("American Gods 10th Anniversary")).toBe("american gods");
  });

  it("strips '5th Anniversary Edition' suffix", () => {
    expect(
      normalizeForTitleMatching(
        "The Phoenix Project: A Novel about IT, DevOps, and Helping Your Business Win 5th Anniversary Edition",
      ),
    ).toBe("the phoenix project a novel about it devops and helping your business win");
  });

  it("strips multiple trailing parentheticals", () => {
    expect(normalizeForTitleMatching("Title (Part 1 of 2) (Unabridged)")).toBe("title");
  });

  it("strips parenthetical with multiple narrator names", () => {
    expect(
      normalizeForTitleMatching("Tales From Earthsea (Le Guin, Brick, De Cuir, Karr, Ellison, and Rudnicki)"),
    ).toBe("tales from earthsea");
  });

  it("returns undefined for empty string", () => {
    expect(normalizeForTitleMatching("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(normalizeForTitleMatching("   ")).toBeUndefined();
  });

  it("returns undefined when stripping leaves nothing", () => {
    expect(normalizeForTitleMatching("(Everything)")).toBeUndefined();
  });

  it("does not strip 'A Novel' from the middle of a title", () => {
    expect(normalizeForTitleMatching("A Novel Bookstore")).toBe("a novel bookstore");
  });

  it("strips GraphAudio variant without 'ic'", () => {
    expect(normalizeForTitleMatching("A Court of Thorns and Roses (GraphAudio)")).toBe(
      "a court of thorns and roses",
    );
  });

  it("handles dash-separated GraphicAudio suffix", () => {
    expect(normalizeForTitleMatching("A Court of Wings and Ruin (1 of 3) - GraphicAudio")).toBe(
      "a court of wings and ruin",
    );
  });

  it("strips 'Part 1 of 2' in title with series suffix after dash", () => {
    expect(normalizeForTitleMatching("Fourth Wing (Part 1 of 2) - The Empyrean, Book 1")).toBe(
      "fourth wing",
    );
  });

  it("strips 'Part 2 of 2' variant", () => {
    expect(normalizeForTitleMatching("Fourth Wing (Part 2 of 2) - The Empyrean, Book 1")).toBe(
      "fourth wing",
    );
  });

  it("strips '- Part 1' suffix", () => {
    expect(normalizeForTitleMatching("Kill 'Em and Leave - Part 1")).toBe("kill em and leave");
  });

  it("strips ': A Memoir' suffix", () => {
    expect(normalizeForTitleMatching("Educated: A Memoir")).toBe("educated");
  });

  it("strips trailing 'A Memoir' without delimiter", () => {
    expect(normalizeForTitleMatching("Educated A Memoir")).toBe("educated");
  });

  it("strips ': A Novella' suffix", () => {
    expect(normalizeForTitleMatching("The Old Man and the Sea: A Novella")).toBe(
      "the old man and the sea",
    );
  });

  it("strips standalone 'Edition' suffix", () => {
    expect(normalizeForTitleMatching("Dune Deluxe Edition")).toBe("dune deluxe");
  });
});

describe("stripSubtitleForMatching", () => {
  it("strips subtitle after colon", () => {
    expect(stripSubtitleForMatching("Sapiens: A Brief History of Humankind")).toBe("sapiens");
  });

  it("strips subtitle after dash separator", () => {
    expect(stripSubtitleForMatching("Working in Public - The Making of Open Source")).toBe(
      "working in public",
    );
  });

  it("returns undefined when no delimiter found", () => {
    expect(stripSubtitleForMatching("The Great Gatsby")).toBeUndefined();
  });

  it("does not treat hyphenated words as delimiters", () => {
    expect(stripSubtitleForMatching("Well-Being - A Guide")).toBe("well being");
  });

  it("returns undefined when prefix is empty", () => {
    expect(stripSubtitleForMatching(": Just a Subtitle")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(stripSubtitleForMatching("")).toBeUndefined();
  });

  it("uses first colon as delimiter", () => {
    expect(stripSubtitleForMatching("Book: Part One: Chapter 1")).toBe("book");
  });

  it("uses first dash separator as delimiter", () => {
    expect(stripSubtitleForMatching("Fancy Bear Goes Phishing - The Dark History - More")).toBe(
      "fancy bear goes phishing",
    );
  });

  it("prefers colon over dash when colon comes first", () => {
    expect(stripSubtitleForMatching("Title: Subtitle - Extra")).toBe("title");
  });

  it("prefers dash over colon when dash comes first", () => {
    expect(stripSubtitleForMatching("Title - Subtitle: Extra")).toBe("title");
  });
});
