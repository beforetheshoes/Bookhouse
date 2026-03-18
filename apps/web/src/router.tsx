import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteErrorBoundary } from "~/components/route-error-boundary";
import { NotFoundPage } from "~/components/not-found-page";
import { RoutePending } from "~/components/route-pending";

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: RouteErrorBoundary,
    defaultNotFoundComponent: NotFoundPage,
    defaultPendingComponent: RoutePending,
  });
}

export function getRouter() {
  return createRouter();
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
