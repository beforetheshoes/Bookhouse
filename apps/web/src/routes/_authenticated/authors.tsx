import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/authors")({
  component: AuthorsLayout,
});

function AuthorsLayout() {
  return <Outlet />;
}
