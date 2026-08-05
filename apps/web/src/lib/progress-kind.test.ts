import { describe, it, expect } from "vitest";
import { progressKindForEdition } from "./progress-kind";

describe("progressKindForEdition", () => {
  it("maps AUDIOBOOK to AUDIO", () => {
    expect(progressKindForEdition("AUDIOBOOK")).toBe("AUDIO");
  });

  it("maps everything else to EBOOK", () => {
    expect(progressKindForEdition("EBOOK")).toBe("EBOOK");
    expect(progressKindForEdition("PDF")).toBe("EBOOK");
  });
});
