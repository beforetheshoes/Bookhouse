import { describe, expect, it } from "vitest";
import { generateSortTitle, generateNameSort } from "./sort-keys";

describe("generateSortTitle", () => {
  it("strips leading 'The' and appends after comma", () => {
    expect(generateSortTitle("The Alchemist")).toBe("alchemist, the");
  });

  it("strips leading 'A' and appends after comma", () => {
    expect(generateSortTitle("A Game of Thrones")).toBe("game of thrones, a");
  });

  it("strips leading 'An' and appends after comma", () => {
    expect(generateSortTitle("An Artist of the Floating World")).toBe(
      "artist of the floating world, an",
    );
  });

  it("does not strip 'The' when not followed by a word boundary", () => {
    expect(generateSortTitle("There Will Come Soft Rains")).toBe(
      "there will come soft rains",
    );
  });

  it("does not strip 'A' when not followed by a word boundary", () => {
    expect(generateSortTitle("Another Country")).toBe("another country");
  });

  it("does not strip 'An' when not followed by a word boundary", () => {
    expect(generateSortTitle("Anthem")).toBe("anthem");
  });

  it("lowercases the result", () => {
    expect(generateSortTitle("THE GREAT GATSBY")).toBe("great gatsby, the");
  });

  it("passes through titles without articles unchanged (lowercased)", () => {
    expect(generateSortTitle("1984")).toBe("1984");
  });

  it("handles single-word title", () => {
    expect(generateSortTitle("Dune")).toBe("dune");
  });

  it("trims whitespace", () => {
    expect(generateSortTitle("  The Hobbit  ")).toBe("hobbit, the");
  });

  it("handles empty string", () => {
    expect(generateSortTitle("")).toBe("");
  });

  it("handles case-insensitive article matching", () => {
    expect(generateSortTitle("the catcher in the rye")).toBe(
      "catcher in the rye, the",
    );
  });
});

describe("generateNameSort", () => {
  it("moves last word to front for multi-word name", () => {
    expect(generateNameSort("Ursula K. Le Guin")).toBe(
      "guin, ursula k. le",
    );
  });

  it("handles simple two-part name", () => {
    expect(generateNameSort("J.R.R. Tolkien")).toBe("tolkien, j.r.r.");
  });

  it("returns single name lowercased", () => {
    expect(generateNameSort("Plato")).toBe("plato");
  });

  it("lowercases the result", () => {
    expect(generateNameSort("STEPHEN KING")).toBe("king, stephen");
  });

  it("trims whitespace", () => {
    expect(generateNameSort("  Neil Gaiman  ")).toBe("gaiman, neil");
  });

  it("handles empty string", () => {
    expect(generateNameSort("")).toBe("");
  });

  it("handles name with multiple spaces between words", () => {
    expect(generateNameSort("Gabriel  García  Márquez")).toBe(
      "márquez, gabriel garcía",
    );
  });
});
