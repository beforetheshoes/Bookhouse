import type { H3Event } from "h3";

export interface KoboAuthDeps {
  findDeviceByToken: (token: string) => Promise<{
    id: string;
    userId: string;
    deviceId: string;
    userKey: string;
    authToken: string;
    status: string;
    lastSyncAt: Date | null;
    createdAt: Date;
  } | null>;
}

export interface KoboAuthResult {
  id: string;
  userId: string;
  deviceId: string;
  userKey: string;
  authToken: string;
  status: string;
  lastSyncAt: Date | null;
  createdAt: Date;
}

const VALID_TOKEN = /^[a-f0-9]{64}$/;

export function createKoboAuth(deps: KoboAuthDeps) {
  return async (event: H3Event): Promise<KoboAuthResult> => {
    const params = event.context.params as Record<string, string>;
    const token = params.token as string;

    if (!VALID_TOKEN.test(token)) {
      throw Object.assign(new Error("Invalid token"), {
        statusCode: 401,
        statusMessage: "Unauthorized",
      });
    }

    const device = await deps.findDeviceByToken(token);

    if (!device) {
      throw Object.assign(new Error("Device not found"), {
        statusCode: 401,
        statusMessage: "Unauthorized",
      });
    }

    if (device.status !== "ACTIVE") {
      throw Object.assign(new Error("Device revoked"), {
        statusCode: 403,
        statusMessage: "Forbidden",
      });
    }

    return device;
  };
}
