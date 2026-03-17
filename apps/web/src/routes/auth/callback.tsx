import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/auth/callback")({
  component: () => <p>Completing sign-in…</p>,
  server: {
    handlers: {
      GET: async () => {
        const { handleCallbackRequest } = await import("../../lib/auth-server");
        return handleCallbackRequest();
      },
    },
  },
});
