import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("returns a string from multiple class inputs", () => {
    const result = cn("foo", "bar", "baz");
    expect(typeof result).toBe("string");
    expect(result).toBe("foo bar baz");
  });

  it("resolves conflicting Tailwind classes (last one wins)", () => {
    expect(cn("w-1 w-2")).toBe("w-2");
    expect(cn("p-4", "p-8")).toBe("p-8");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles conditional classes", () => {
    const active = true;
    const disabled = false;
    expect(cn("base", active && "active", disabled && "disabled")).toBe(
      "base active",
    );
  });

  it("returns empty string for no input", () => {
    expect(cn()).toBe("");
  });
});
