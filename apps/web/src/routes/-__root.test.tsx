import React from "react";
import { describe, expect, it } from "vitest";
import { RootComponent, Route } from "./__root";

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
});
