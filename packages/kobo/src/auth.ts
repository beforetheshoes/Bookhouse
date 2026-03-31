import { randomBytes, createHash } from "node:crypto";

export function generateAuthToken(): string {
  return randomBytes(32).toString("hex");
}

export function generateUserKey(userId: string, deviceId: string): string {
  return createHash("sha256")
    .update(`${userId}:${deviceId}`)
    .digest("hex")
    .slice(0, 32);
}

export function validateAuthToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}

export interface DeviceLookupResult {
  id: string;
  userId: string;
  deviceId: string;
  userKey: string;
  authToken: string;
  status: "ACTIVE" | "REVOKED";
  lastSyncAt: Date | null;
  createdAt: Date;
}

export interface AuthenticateDeviceDeps {
  findDeviceByToken: (token: string) => Promise<DeviceLookupResult | null>;
}

export async function authenticateDevice(
  token: string,
  deps: AuthenticateDeviceDeps,
): Promise<DeviceLookupResult> {
  if (!validateAuthToken(token)) {
    throw new AuthError("Invalid token format");
  }

  const device = await deps.findDeviceByToken(token);
  if (!device) {
    throw new AuthError("Device not found");
  }

  if (device.status === "REVOKED") {
    throw new AuthError("Device has been revoked");
  }

  return device;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
