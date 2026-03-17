import { describe, expect, it } from "vitest";
import { AUTH_PACKAGE, AUTH_TYPES, clearSession } from "./index";

describe("auth package barrel", () => {
  it("re-exports runtime helpers", () => {
    expect(AUTH_PACKAGE).toBe("@bookhouse/auth");
    expect(AUTH_TYPES).toBe("auth-types");
    expect(clearSession()).toEqual({});
  });
});
