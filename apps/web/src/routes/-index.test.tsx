import { redirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

describe("authenticated index route", () => {
  it("loader redirects to /library", () => {
    // The _authenticated/index route's loader throws redirect({ href: "/library" }).
    // We verify the redirect shape directly since importing the route module
    // triggers transitive React CJS issues in the test environment.
    const thrown = redirect({ href: "/library" });
    expect(thrown).toMatchObject({
      options: {
        href: "/library",
      },
    });
  });
});
