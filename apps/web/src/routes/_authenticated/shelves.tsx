import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/shelves")({
  component: ShelvesLayout,
});

function ShelvesLayout() {
  return <Outlet />;
}
