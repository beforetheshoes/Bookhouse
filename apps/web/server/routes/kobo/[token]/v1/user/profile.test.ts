import { describe, it, expect, vi } from "vitest";
import { createUserProfileHandler } from "./profile";
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

describe("createUserProfileHandler", () => {
  it("returns user profile with UserId from device", async () => {
    const handler = createUserProfileHandler({
      auth: { findDeviceByToken: vi.fn().mockResolvedValue(mockDevice) },
    });
    const event = {
      context: { params: { token: validToken } },
    } as unknown as H3Event;

    const result = await handler(event);

    expect(result.UserId).toBe("d1");
    expect(result.HasPrestoAccess).toBe(false);
    expect(result.IsWeeklyDealsSubscriber).toBe(false);
  });

  it("throws when auth fails", async () => {
    const handler = createUserProfileHandler({
      auth: { findDeviceByToken: vi.fn().mockResolvedValue(null) },
    });
    const event = {
      context: { params: { token: validToken } },
    } as unknown as H3Event;

    await expect(handler(event)).rejects.toThrow();
  });
});
