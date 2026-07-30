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

  // Real shapes found in the library — 54 of 1209 contributors carry a comma.
  it("leaves an already-inverted name inverted", () => {
    // Naive last-word-first double-inverts this to "molly, crabapple,".
    expect(generateNameSort("Crabapple, Molly")).toBe("crabapple, molly");
  });

  it("normalizes spacing in an already-inverted name", () => {
    expect(generateNameSort("Le Guin,   Ursula K.")).toBe("le guin, ursula k.");
  });

  it("sorts a multi-author string by the first author's surname", () => {
    // Naive handling hoists the very last word, filing five authors under
    // "jefferson" — the surname of the person listed last.
    expect(
      generateNameSort("John Clarke, Brian Roberts, Stuart Hall, Chas Critcher, Tony Jefferson"),
    ).toBe("clarke, john");
  });

  it("ignores a trailing credential", () => {
    expect(generateNameSort("John Gottman, PhD")).toBe("gottman, john");
  });

  it("ignores a trailing credential after a multi-word surname", () => {
    expect(generateNameSort("Julie Schwartz Gottman, PhD")).toBe(
      "gottman, julie schwartz",
    );
  });

  it("keeps a generational suffix with the given names", () => {
    expect(generateNameSort("Martin Luther King Jr.")).toBe(
      "king, martin luther jr.",
    );
  });

  it("ignores a music-doctorate credential", () => {
    expect(generateNameSort("Amelia Nagoski, DMA")).toBe("nagoski, amelia");
  });

  it("files a semicolon-separated author list under the first author", () => {
    expect(generateNameSort("Bookchin, Murray;Price, Andy;")).toBe("bookchin");
  });

  it("handles a surname with nothing but a suffix after it", () => {
    expect(generateNameSort("King Jr.")).toBe("king jr.");
  });

  it("handles input that is only punctuation", () => {
    expect(generateNameSort(",")).toBe(",");
  });

  it("returns a bare credential unchanged", () => {
    // Junk contributor rows exist ("PhD", "MD"); they must not throw.
    expect(generateNameSort("PhD")).toBe("phd");
  });
});
