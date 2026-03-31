import { defineEventHandler } from "h3";
import type { H3Event } from "h3";
import type { KoboAuthDeps } from "../../auth-helper";

export interface DeviceAuthHandlerDeps {
  auth: KoboAuthDeps;
  updateLastSync: (deviceId: string) => Promise<void>;
}

export function createDeviceAuthHandler(deps: DeviceAuthHandlerDeps) {
  return async (event: H3Event) => {
    const { createKoboAuth } = await import("../../auth-helper");
    const auth = createKoboAuth(deps.auth);
    const device = await auth(event);

    await deps.updateLastSync(device.id);

    return {
      UserKey: device.userKey,
      TokenType: "Bearer",
      AccessToken: device.authToken,
      RefreshToken: device.authToken,
      TrackingId: device.id,
    };
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");

  const handler = createDeviceAuthHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
    updateLastSync: async (deviceId) => {
      await db.koboDevice.update({
        where: { id: deviceId },
        data: { lastSyncAt: new Date() },
      });
    },
  });

  return handler(event);
});
/* c8 ignore stop */
