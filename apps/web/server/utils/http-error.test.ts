import { describe, expect, it } from "vitest";
import { httpError } from "./http-error";

describe("httpError", () => {
  it("defaults statusMessage to the message", () => {
    const err = httpError("Invalid size", 400);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Invalid size");
    expect(err.statusCode).toBe(400);
    expect(err.statusMessage).toBe("Invalid size");
  });

  it("uses an explicit statusMessage when given", () => {
    const err = httpError("Edition file not found", 404, "Not found");
    expect(err.message).toBe("Edition file not found");
    expect(err.statusCode).toBe(404);
    expect(err.statusMessage).toBe("Not found");
  });
});
