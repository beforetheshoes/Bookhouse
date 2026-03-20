import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/series")({
  component: SeriesLayout,
});

function SeriesLayout() {
  return <Outlet />;
}
