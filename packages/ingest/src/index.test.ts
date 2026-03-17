import { describe, expect, it } from "vitest";
import { INGEST_PLACEHOLDER } from "./index";

describe("ingest package", () => {
  it("exports the ingest placeholder", () => {
    expect(INGEST_PLACEHOLDER).toBe("ingest");
  });
});
