import { defineEventHandler } from "h3";
import type { H3Event } from "h3";
import type { KoboAuthDeps } from "../../../auth-helper";

export interface UserProfileHandlerDeps {
  auth: KoboAuthDeps;
}

export function createUserProfileHandler(deps: UserProfileHandlerDeps) {
  return async (event: H3Event) => {
    const { createKoboAuth } = await import("../../../auth-helper");
    const auth = createKoboAuth(deps.auth);
    const device = await auth(event);

    return {
      UserId: device.id,
      UserKey: device.userKey,
      HasPrestoAccess: false,
      IsWeeklyDealsSubscriber: false,
      IsEmailNewsletterSubscriber: false,
      IsFullAccount: false,
      DisplayName: "Bookhouse",
    };
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");

  const handler = createUserProfileHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
  });

  return handler(event);
});
/* c8 ignore stop */
