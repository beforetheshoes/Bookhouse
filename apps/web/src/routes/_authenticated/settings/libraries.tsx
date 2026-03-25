import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/libraries")({
  beforeLoad: () => {
    throw redirect({ to: "/settings" });
  },
});
