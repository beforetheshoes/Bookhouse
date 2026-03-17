import React from "react";
import { describe, expect, it } from "vitest";
import { RootComponent, Route } from "./__root";

describe("root route", () => {
  it("defines document metadata and renders the shell", () => {
    expect(Route.options.head?.({} as never)).toEqual({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Bookhouse" },
      ],
    });
    expect(React.isValidElement(RootComponent())).toBe(true);
  });
});
