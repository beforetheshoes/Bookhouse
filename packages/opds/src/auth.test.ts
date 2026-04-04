import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth";

describe("hashPassword", () => {
  it("returns a salt:hash string", async () => {
    const result = await hashPassword("mypassword");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBeDefined();
    expect(parts[0]?.length).toBe(64); // 32 bytes hex
    expect(parts[1]).toBeDefined();
    expect(parts[1]?.length).toBe(128); // 64 bytes hex
  });

  it("produces different hashes for the same password (unique salts)", async () => {
    const a = await hashPassword("mypassword");
    const b = await hashPassword("mypassword");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const stored = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", stored)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const stored = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("returns false for malformed stored hash (missing colon)", async () => {
    expect(await verifyPassword("anything", "nocolonhere")).toBe(false);
  });

  it("returns false for malformed stored hash (bad hex)", async () => {
    expect(await verifyPassword("anything", "zz:yy")).toBe(false);
  });

  it("returns false for empty stored hash", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});
