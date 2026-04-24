import { describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import type { KoreaderUserAuthDeps } from "./auth";
import { createKoreaderUserAuthHandler } from "./auth";

function makeEvent(): H3Event {
  return {} as H3Event;
}

function makeDeps(overrides: Partial<KoreaderUserAuthDeps> = {}): KoreaderUserAuthDeps {
  return {
    auth: vi.fn().mockResolvedValue({
      credentialId: "kc1",
      userId: "u1",
      username: "reader",
    }),
    ...overrides,
  };
}

describe("KOReader users/auth route", () => {
  it("returns authorized OK for valid credentials", async () => {
    const handler = createKoreaderUserAuthHandler(makeDeps());
    await expect(handler(makeEvent())).resolves.toEqual({ authorized: "OK" });
  });

  it("bubbles auth errors", async () => {
    const handler = createKoreaderUserAuthHandler(makeDeps({
      auth: vi.fn().mockRejectedValue(Object.assign(new Error("Unauthorized"), { statusCode: 401 })),
    }));

    await expect(handler(makeEvent())).rejects.toThrow("Unauthorized");
  });
});
