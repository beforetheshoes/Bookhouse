import { describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import type { KoreaderProgressPutDeps } from "./progress";
import { createKoreaderProgressPutHandler } from "./progress";

function makeEvent(): H3Event {
  return {} as H3Event;
}

function makeDeps(overrides: Partial<KoreaderProgressPutDeps> = {}): KoreaderProgressPutDeps {
  return {
    auth: vi.fn().mockResolvedValue({ credentialId: "kc1", userId: "u1", username: "reader" }),
    readBody: vi.fn().mockResolvedValue({
      document: "abcd1234",
      progress: "epubcfi(/6/2!/4/2/8)",
      percentage: 55,
      device: "KOReader",
      device_id: "device-1",
    }),
    resolveDocument: vi.fn().mockResolvedValue({
      editionId: "ed-1",
      fileAssetId: "fa-1",
      document: "abcd1234",
    }),
    findExistingProgress: vi.fn().mockResolvedValue(null),
    upsertProgress: vi.fn().mockResolvedValue({ updatedAt: new Date("2024-07-01T12:00:00.000Z") }),
    now: vi.fn().mockReturnValue(new Date("2024-07-01T12:00:00.000Z")),
    ...overrides,
  };
}

describe("KOReader progress PUT route", () => {
  it("creates a koreader progress record", async () => {
    const deps = makeDeps();
    const handler = createKoreaderProgressPutHandler(deps);

    const result = await handler(makeEvent());

    expect(deps.upsertProgress).toHaveBeenCalledWith({
      userId: "u1",
      editionId: "ed-1",
      percent: 55,
      progress: "epubcfi(/6/2!/4/2/8)",
      device: "KOReader",
      deviceId: "device-1",
      document: "abcd1234",
      timestamp: new Date("2024-07-01T12:00:00.000Z"),
    });
    expect(result).toEqual({
      document: "abcd1234",
      timestamp: 1719835200,
    });
  });

  it("rejects unknown documents", async () => {
    const deps = makeDeps({
      resolveDocument: vi.fn().mockResolvedValue(null),
    });
    const handler = createKoreaderProgressPutHandler(deps);

    await expect(handler(makeEvent())).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  it("rejects invalid payloads", async () => {
    const deps = makeDeps({
      readBody: vi.fn().mockResolvedValue({
        document: "abcd1234",
        percentage: 55,
      }),
    });
    const handler = createKoreaderProgressPutHandler(deps);

    await expect(handler(makeEvent())).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it("skips stale device updates when the server record is newer", async () => {
    const deps = makeDeps({
      readBody: vi.fn().mockResolvedValue({
        document: "abcd1234",
        progress: "old-progress",
        percentage: 20,
        device: "KOReader",
        device_id: "device-1",
        timestamp: 1719830000,
      }),
      findExistingProgress: vi.fn().mockResolvedValue({
        updatedAt: new Date("2024-07-01T12:00:00.000Z"),
      }),
    });
    const handler = createKoreaderProgressPutHandler(deps);

    const result = await handler(makeEvent());

    expect(deps.upsertProgress).not.toHaveBeenCalled();
    expect(result).toEqual({
      document: "abcd1234",
      timestamp: 1719835200,
    });
  });

  it("uses the fallback clock when the device timestamp is invalid", async () => {
    const deps = makeDeps({
      readBody: vi.fn().mockResolvedValue({
        document: "abcd1234",
        progress: "epubcfi(/6/2!/4/2/8)",
        percentage: 55,
        device: "KOReader",
        device_id: "device-1",
        timestamp: Number.NaN,
      }),
    });
    const handler = createKoreaderProgressPutHandler(deps);

    await handler(makeEvent());

    expect(deps.upsertProgress).toHaveBeenCalledWith(expect.objectContaining({
      timestamp: new Date("2024-07-01T12:00:00.000Z"),
    }));
  });
});
