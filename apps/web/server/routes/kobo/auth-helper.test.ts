import { describe, it, expect, vi } from "vitest";
import { createKoboAuth } from "./auth-helper";
import type { KoboAuthDeps } from "./auth-helper";
import type { H3Event } from "h3";

function makeEvent(token: string): H3Event {
  return { context: { params: { token } } } as unknown as H3Event;
}

const mockDevice = {
  id: "d1",
  userId: "u1",
  deviceId: "My Kobo",
  userKey: "key123",
  authToken: "a".repeat(64),
  status: "ACTIVE",
  lastSyncAt: null,
  createdAt: new Date("2024-01-01"),
};

function makeDeps(overrides: Partial<KoboAuthDeps> = {}): KoboAuthDeps {
  return {
    findDeviceByToken: vi.fn().mockResolvedValue(mockDevice),
    ...overrides,
  };
}

describe("createKoboAuth", () => {
  it("returns device for valid active token", async () => {
    const deps = makeDeps();
    const auth = createKoboAuth(deps);
    const result = await auth(makeEvent("a".repeat(64)));
    expect(result).toEqual(mockDevice);
  });

  it("throws 401 for invalid token format", async () => {
    const deps = makeDeps();
    const auth = createKoboAuth(deps);

    try {
      await auth(makeEvent("bad-token"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe("Invalid token");
    }
  });

  it("throws 401 when device not found", async () => {
    const deps = makeDeps({
      findDeviceByToken: vi.fn().mockResolvedValue(null),
    });
    const auth = createKoboAuth(deps);

    try {
      await auth(makeEvent("a".repeat(64)));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe("Device not found");
    }
  });

  it("throws 403 when device is revoked", async () => {
    const deps = makeDeps({
      findDeviceByToken: vi
        .fn()
        .mockResolvedValue({ ...mockDevice, status: "REVOKED" }),
    });
    const auth = createKoboAuth(deps);

    try {
      await auth(makeEvent("a".repeat(64)));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe("Device revoked");
    }
  });
});
