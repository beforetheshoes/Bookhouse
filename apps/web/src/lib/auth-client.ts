import { createServerFn } from "@tanstack/react-start";
import type { AuthenticatedUser } from "@bookhouse/auth";

export const getCurrentUserServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthenticatedUser | null> => {
    const { getCurrentUser } = await import("./auth-server");
    return getCurrentUser();
  },
);
