import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/auth/logout")({
  component: () => <p>Signing out…</p>,
  server: {
    handlers: {
      GET: async () => {
        const { handleLogoutRequest } = await import("../../lib/auth-server");
        return handleLogoutRequest();
      },
      POST: async () => {
        const { handleLogoutRequest } = await import("../../lib/auth-server");
        return handleLogoutRequest();
      },
    },
  },
});
