import { describe, expect, it } from "vitest";
import { DOMAIN_PLACEHOLDER } from "./index";

describe("domain package", () => {
  it("exports the domain placeholder", () => {
    expect(DOMAIN_PLACEHOLDER).toBe("domain");
  });
});
