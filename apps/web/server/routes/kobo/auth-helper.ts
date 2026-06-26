import type { H3Event } from "h3";
import { httpError } from "../../utils/http-error";

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
      throw httpError("Invalid token", 401, "Unauthorized");
    }

    const device = await deps.findDeviceByToken(token);

    if (!device) {
      throw httpError("Device not found", 401, "Unauthorized");
    }

    if (device.status !== "ACTIVE") {
      throw httpError("Device revoked", 403, "Forbidden");
    }

    return device;
  };
}
