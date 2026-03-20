import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryLayout,
});

function LibraryLayout() {
  return <Outlet />;
}
