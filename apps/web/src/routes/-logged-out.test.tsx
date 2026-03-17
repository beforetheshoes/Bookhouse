import React from "react";
import { describe, expect, it } from "vitest";
import { LoggedOutPage, Route } from "./logged-out";

describe("logged-out route", () => {
  it("renders a signed-out screen", () => {
    expect(Route).toBeDefined();
    expect(React.isValidElement(LoggedOutPage())).toBe(true);
  });
});
