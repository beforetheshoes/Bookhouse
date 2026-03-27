import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUserServerFn } from "../lib/auth-client";
import {
  SidebarInset,
  SidebarProvider,
} from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";
import { AppHeader } from "~/components/app-header";
import { ThemeProvider } from "~/hooks/use-theme";
import { AppColorProvider } from "~/hooks/use-app-color";
import { getThemeServerFn, getColorModeServerFn, getAccentColorServerFn } from "~/lib/server-fns/app-settings";

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

    const [theme, colorMode, accentColor] = await Promise.all([
      getThemeServerFn(),
      getColorModeServerFn(),
      getAccentColorServerFn(),
    ]);

    return { user, theme, colorMode, accentColor };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, theme, colorMode, accentColor } = Route.useRouteContext();

  return (
    <ThemeProvider initialTheme={theme}>
      <AppColorProvider initialColorMode={colorMode} initialAccentColor={accentColor}>
        <SidebarProvider>
          <AppSidebar user={user} />
          <SidebarInset>
            <AppHeader />
            <main className="flex-1 p-6">
              <Outlet />
            </main>
          </SidebarInset>
        </SidebarProvider>
      </AppColorProvider>
    </ThemeProvider>
  );
}
