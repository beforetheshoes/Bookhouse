import { describe, it, expect } from "vitest";
import { isForeignKeyConstraintError } from "./errors";

describe("isForeignKeyConstraintError", () => {
  it("returns true for a Prisma P2003 foreign-key violation", () => {
    const error = Object.assign(new Error("FK failed"), { code: "P2003" });
    expect(isForeignKeyConstraintError(error)).toBe(true);
  });

  it("returns false for a different Prisma error code", () => {
    const error = Object.assign(new Error("unique"), { code: "P2002" });
    expect(isForeignKeyConstraintError(error)).toBe(false);
  });

  it("returns false for an error without a code", () => {
    expect(isForeignKeyConstraintError(new Error("plain"))).toBe(false);
  });
});
