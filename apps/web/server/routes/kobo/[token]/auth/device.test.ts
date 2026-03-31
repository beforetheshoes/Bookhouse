import { describe, it, expect, vi } from "vitest";
import { createDeviceAuthHandler } from "./device";
import type { DeviceAuthHandlerDeps } from "./device";
import type { H3Event } from "h3";

const validToken = "a".repeat(64);

const mockDevice = {
  id: "d1",
  userId: "u1",
  deviceId: "My Kobo",
  userKey: "userkey123",
  authToken: validToken,
  status: "ACTIVE",
  lastSyncAt: null,
  createdAt: new Date("2024-01-01"),
};

function makeEvent(): H3Event {
  return { context: { params: { token: validToken } } } as unknown as H3Event;
}

function makeDeps(overrides: Partial<DeviceAuthHandlerDeps> = {}): DeviceAuthHandlerDeps {
  return {
    auth: {
      findDeviceByToken: vi.fn().mockResolvedValue(mockDevice),
    },
    updateLastSync: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createDeviceAuthHandler", () => {
  it("returns auth response with device tokens", async () => {
    const deps = makeDeps();
    const handler = createDeviceAuthHandler(deps);
    const result = await handler(makeEvent());

    expect(result).toEqual({
      UserKey: "userkey123",
      TokenType: "Bearer",
      AccessToken: validToken,
      RefreshToken: validToken,
      TrackingId: "d1",
    });
  });

  it("updates last sync time", async () => {
    const deps = makeDeps();
    const handler = createDeviceAuthHandler(deps);
    await handler(makeEvent());

    expect(deps.updateLastSync).toHaveBeenCalledWith("d1");
  });

  it("throws when token is invalid", async () => {
    const deps = makeDeps({
      auth: { findDeviceByToken: vi.fn().mockResolvedValue(null) },
    });
    const handler = createDeviceAuthHandler(deps);
    const event = { context: { params: { token: "bad" } } } as unknown as H3Event;

    await expect(handler(event)).rejects.toThrow();
  });
});
