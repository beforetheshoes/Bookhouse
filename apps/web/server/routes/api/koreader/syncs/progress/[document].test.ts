import { describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import type { KoreaderProgressGetDeps } from "./[document]";
import { createKoreaderProgressGetHandler } from "./[document]";

function makeEvent(document = "abcd1234"): H3Event {
  return {
    context: { params: { document } },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<KoreaderProgressGetDeps> = {}): KoreaderProgressGetDeps {
  return {
    auth: vi.fn().mockResolvedValue({ credentialId: "kc1", userId: "u1", username: "reader" }),
    resolveDocument: vi.fn().mockResolvedValue({ editionId: "ed-1", fileAssetId: "fa-1", document: "abcd1234" }),
    findProgress: vi.fn().mockResolvedValue({
      percent: 55,
      locator: {
        koreader: {
          document: "abcd1234",
          progress: "epubcfi(/6/2!/4/2/8)",
          percentage: 55,
          device: "KOReader",
          deviceId: "device-1",
        },
      },
      updatedAt: new Date("2024-07-01T12:00:00.000Z"),
    }),
    ...overrides,
  };
}

describe("KOReader progress GET route", () => {
  it("returns the stored koreader progress for a matched document", async () => {
    const handler = createKoreaderProgressGetHandler(makeDeps());

    await expect(handler(makeEvent())).resolves.toEqual({
      document: "abcd1234",
      progress: "epubcfi(/6/2!/4/2/8)",
      percentage: 55,
      device: "KOReader",
      device_id: "device-1",
      timestamp: 1719835200,
    });
  });

  it("returns 404 for an unknown document", async () => {
    const handler = createKoreaderProgressGetHandler(makeDeps({
      resolveDocument: vi.fn().mockResolvedValue(null),
    }));

    await expect(handler(makeEvent())).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  it("returns 400 when the document route param is missing", async () => {
    const handler = createKoreaderProgressGetHandler(makeDeps());

    await expect(handler({
      context: { params: {} },
    } as unknown as H3Event)).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it("returns 404 when there is no stored koreader locator", async () => {
    const handler = createKoreaderProgressGetHandler(makeDeps({
      findProgress: vi.fn().mockResolvedValue({
        percent: 55,
        locator: {},
        updatedAt: new Date("2024-07-01T12:00:00.000Z"),
      }),
    }));

    await expect(handler(makeEvent())).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });
});
