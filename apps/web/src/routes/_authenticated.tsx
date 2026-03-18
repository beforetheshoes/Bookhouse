import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUserServerFn } from "../lib/auth-client";
import {
  SidebarInset,
  SidebarProvider,
} from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";
import { AppHeader } from "~/components/app-header";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    const serverContext = context as
      | {
          auth?: {
            user?: Awaited<ReturnType<typeof getCurrentUserServerFn>>;
          };
        }
      | undefined;
    const user =
      serverContext?.auth?.user ?? (await getCurrentUserServerFn());

    if (!user) {
      throw redirect({ href: "/auth/login" });
    }

    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
