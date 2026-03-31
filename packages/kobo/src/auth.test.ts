import { describe, it, expect, vi } from "vitest";
import {
  generateAuthToken,
  generateUserKey,
  validateAuthToken,
  authenticateDevice,
  AuthError,
} from "./auth";
import type { AuthenticateDeviceDeps, DeviceLookupResult } from "./auth";

describe("generateAuthToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateAuthToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates unique tokens", () => {
    const a = generateAuthToken();
    const b = generateAuthToken();
    expect(a).not.toBe(b);
  });
});

describe("generateUserKey", () => {
  it("returns a 32-character hex string", () => {
    const key = generateUserKey("user-1", "device-1");
    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });

  it("is deterministic for same inputs", () => {
    const a = generateUserKey("user-1", "device-1");
    const b = generateUserKey("user-1", "device-1");
    expect(a).toBe(b);
  });

  it("differs for different inputs", () => {
    const a = generateUserKey("user-1", "device-1");
    const b = generateUserKey("user-1", "device-2");
    expect(a).not.toBe(b);
  });
});

describe("validateAuthToken", () => {
  it("accepts valid 64-char hex tokens", () => {
    expect(validateAuthToken("a".repeat(64))).toBe(true);
  });

  it("rejects tokens that are too short", () => {
    expect(validateAuthToken("a".repeat(63))).toBe(false);
  });

  it("rejects tokens with invalid characters", () => {
    expect(validateAuthToken("z".repeat(64))).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(validateAuthToken("")).toBe(false);
  });
});

describe("authenticateDevice", () => {
  const mockDevice: DeviceLookupResult = {
    id: "d1",
    userId: "u1",
    deviceId: "My Kobo",
    userKey: "key123",
    authToken: "a".repeat(64),
    status: "ACTIVE",
    lastSyncAt: null,
    createdAt: new Date("2024-01-01"),
  };

  function makeDeps(
    overrides: Partial<AuthenticateDeviceDeps> = {},
  ): AuthenticateDeviceDeps {
    return {
      findDeviceByToken: vi.fn().mockResolvedValue(mockDevice),
      ...overrides,
    };
  }

  it("returns device for valid active token", async () => {
    const deps = makeDeps();
    const result = await authenticateDevice("a".repeat(64), deps);
    expect(result).toEqual(mockDevice);
    expect(deps.findDeviceByToken).toHaveBeenCalledWith("a".repeat(64));
  });

  it("throws AuthError for invalid token format", async () => {
    const deps = makeDeps();
    await expect(authenticateDevice("bad-token", deps)).rejects.toThrow(
      AuthError,
    );
    await expect(authenticateDevice("bad-token", deps)).rejects.toThrow(
      "Invalid token format",
    );
  });

  it("throws AuthError when device not found", async () => {
    const deps = makeDeps({
      findDeviceByToken: vi.fn().mockResolvedValue(null),
    });
    await expect(
      authenticateDevice("a".repeat(64), deps),
    ).rejects.toThrow("Device not found");
  });

  it("throws AuthError when device is revoked", async () => {
    const deps = makeDeps({
      findDeviceByToken: vi
        .fn()
        .mockResolvedValue({ ...mockDevice, status: "REVOKED" }),
    });
    await expect(
      authenticateDevice("a".repeat(64), deps),
    ).rejects.toThrow("Device has been revoked");
  });
});
