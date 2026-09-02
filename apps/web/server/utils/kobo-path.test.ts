import { describe, expect, it } from "vitest";
import { redactKoboToken } from "./kobo-path";

describe("redactKoboToken", () => {
  it("replaces the device token segment with a stub keeping the last four characters", () => {
    const token = "a".repeat(60) + "beef";
    expect(redactKoboToken(`/kobo/${token}/v1/library/sync`)).toBe("/kobo/<token…beef>/v1/library/sync");
    expect(redactKoboToken(`/kobo/${token}`)).toBe("/kobo/<token…beef>");
  });

  it("leaves paths outside /kobo/ untouched", () => {
    expect(redactKoboToken("/api/koreader/users/auth")).toBe("/api/koreader/users/auth");
    expect(redactKoboToken("/kobo")).toBe("/kobo");
  });
});
