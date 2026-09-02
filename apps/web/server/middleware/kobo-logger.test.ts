import { describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import { createKoboLogger } from "./kobo-logger";

function makeEvent(pathname: string, method = "GET"): H3Event {
  return { url: { pathname }, req: { method } } as Partial<H3Event> as H3Event;
}

describe("createKoboLogger", () => {
  it("logs Kobo requests with the device token redacted", () => {
    const log = vi.fn();
    createKoboLogger(log)(makeEvent(`/kobo/${"f".repeat(64)}/v1/initialization`, "POST"));
    expect(log).toHaveBeenCalledWith("[kobo] POST /kobo/<token…ffff>/v1/initialization");
  });

  it("ignores requests outside /kobo/", () => {
    const log = vi.fn();
    createKoboLogger(log)(makeEvent("/api/events"));
    expect(log).not.toHaveBeenCalled();
  });
});
