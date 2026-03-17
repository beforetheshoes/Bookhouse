import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/login")({
  component: () => <p>Redirecting to your identity provider…</p>,
  server: {
    handlers: {
      GET: async () => {
        const { handleLoginRequest } = await import("../../lib/auth-server");
        return handleLoginRequest();
      },
    },
  },
});
