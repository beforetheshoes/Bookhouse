import { describe, it, expect, vi } from "vitest";
import { createInitializationHandler } from "./initialization";
import type { H3Event } from "h3";

const validToken = "a".repeat(64);

const mockDevice = {
  id: "d1",
  userId: "u1",
  deviceId: "My Kobo",
  userKey: "key",
  authToken: validToken,
  status: "ACTIVE",
  lastSyncAt: null,
  createdAt: new Date("2024-01-01"),
};

describe("createInitializationHandler", () => {
  it("returns Resources with self-hosted URLs and sets apitoken header", async () => {
    const mockSetHeader = vi.fn();
    const handler = createInitializationHandler({
      auth: { findDeviceByToken: vi.fn().mockResolvedValue(mockDevice) },
      getBaseUrl: () => "http://192.168.1.10:3000",
      setResponseHeader: mockSetHeader,
    });
    const event = {
      context: { params: { token: validToken } },
    } as unknown as H3Event;

    const result = await handler(event);

    // Our overridden keys point to the self-hosted server
    expect(result.Resources.image_host).toBe("http://192.168.1.10:3000");
    expect(result.Resources.library_sync).toBe(
      `http://192.168.1.10:3000/kobo/${validToken}/v1/library/sync`,
    );
    expect(result.Resources.image_url_quality_template).toContain("{ImageId}");
    expect(result.Resources.image_url_quality_template).toContain(validToken);
    expect(result.Resources.oauth_host).toBe(
      `http://192.168.1.10:3000/kobo/${validToken}/oauth`,
    );

    // Non-overridden keys still point to the native Kobo store
    expect(result.Resources.user_wishlist).toBe("https://storeapi.kobo.com/v1/user/wishlist");
    expect(result.Resources.library_items).toBe("https://storeapi.kobo.com/v1/user/library");
    expect(result.Resources.deals).toBe("https://storeapi.kobo.com/v1/deals");

    // x-kobo-apitoken is hardcoded "e30=" (base64 for {}) to match calibre-web
    expect(mockSetHeader).toHaveBeenCalledWith(event, "x-kobo-apitoken", "e30=");
  });

  it("throws when auth fails", async () => {
    const handler = createInitializationHandler({
      auth: { findDeviceByToken: vi.fn().mockResolvedValue(null) },
      getBaseUrl: () => "http://localhost:3000",
      setResponseHeader: vi.fn(),
    });
    const event = {
      context: { params: { token: validToken } },
    } as unknown as H3Event;

    await expect(handler(event)).rejects.toThrow();
  });
});
