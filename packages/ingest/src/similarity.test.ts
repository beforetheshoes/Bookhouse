import { describe, it, expect } from "vitest";
import { levenshteinDistance, normalizedSimilarity } from "./similarity";

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
