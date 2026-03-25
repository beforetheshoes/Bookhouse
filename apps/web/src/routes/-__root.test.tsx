import React from "react";
import { describe, expect, it } from "vitest";
import { RootComponent, Route, THEME_INIT_SCRIPT } from "./__root";

describe("root route", () => {
  it("defines document metadata and renders the shell", async () => {
    const head = await Route.options.head?.({} as never);
    expect(head?.meta).toEqual([
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bookhouse" },
    ]);
    expect(head?.links).toBeDefined();
    expect(React.isValidElement(RootComponent())).toBe(true);
  });

  it("exports THEME_INIT_SCRIPT as a non-empty string", () => {
    expect(typeof THEME_INIT_SCRIPT).toBe("string");
    expect(THEME_INIT_SCRIPT.length).toBeGreaterThan(0);
    expect(THEME_INIT_SCRIPT).toContain("prefers-color-scheme");
  });
});
