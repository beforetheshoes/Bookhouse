import { describe, it, expect } from "vitest";
import {
  encodeSyncToken,
  decodeSyncToken,
  createInitialSyncToken,
} from "./sync-token";
import type { SyncToken } from "./types";

describe("encodeSyncToken", () => {
  it("encodes a sync token to a prefixed base64url string", () => {
    const token: SyncToken = {
      lastSyncAt: "2024-01-01T00:00:00.000Z",
      archive: false,
    };
    const encoded = encodeSyncToken(token);
    expect(encoded).toMatch(/^kobo-sync-/);
  });
});

describe("decodeSyncToken", () => {
  it("round-trips encode/decode", () => {
    const token: SyncToken = {
      lastSyncAt: "2024-06-15T12:00:00.000Z",
      archive: true,
    };
    const encoded = encodeSyncToken(token);
    const decoded = decodeSyncToken(encoded);
    expect(decoded).toEqual(token);
  });

  it("returns null for invalid prefix", () => {
    expect(decodeSyncToken("bad-prefix-abc")).toBeNull();
  });

  it("returns null for invalid base64", () => {
    expect(decodeSyncToken("kobo-sync-!!!invalid!!!")).toBeNull();
  });

  it("returns null for valid base64 with wrong shape", () => {
    const bad = "kobo-sync-" + Buffer.from('{"foo":"bar"}').toString("base64url");
    expect(decodeSyncToken(bad)).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    const bad = "kobo-sync-" + Buffer.from('"hello"').toString("base64url");
    expect(decodeSyncToken(bad)).toBeNull();
  });
});

describe("createInitialSyncToken", () => {
  it("returns a token with epoch timestamp and archive false", () => {
    const token = createInitialSyncToken();
    expect(token.lastSyncAt).toBe("1970-01-01T00:00:00.000Z");
    expect(token.archive).toBe(false);
  });
});
