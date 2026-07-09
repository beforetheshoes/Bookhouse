import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { isOwner } from "@bookhouse/auth";
import { getCurrentUserServerFn } from "../lib/auth-client";
import { GlobalUploadDrop } from "~/components/global-upload-drop";
import { stashPendingUploadFiles } from "~/lib/pending-upload";
import {
  SidebarInset,
  SidebarProvider,
} from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";
import { AppHeader } from "~/components/app-header";
import { ThemeProvider } from "~/hooks/use-theme";
import { AppColorProvider } from "~/hooks/use-app-color";
import {
  getThemeServerFn,
  getColorModeServerFn,
  getAccentColorServerFn,
  getBrandPaletteServerFn,
} from "~/lib/server-fns/app-settings";

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

    const [theme, colorMode, accentColor, brandPalette] = await Promise.all([
      getThemeServerFn(),
      getColorModeServerFn(),
      getAccentColorServerFn(),
      getBrandPaletteServerFn(),
    ]);

    return { user, theme, colorMode, accentColor, brandPalette };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, theme, colorMode, accentColor, brandPalette } = Route.useRouteContext();
  const router = useRouter();

  function handleGlobalDrop(files: File[]): void {
    stashPendingUploadFiles(files);
    void router.navigate({ to: "/upload" });
  }

  return (
    <ThemeProvider initialTheme={theme}>
      <AppColorProvider
        initialColorMode={colorMode}
        initialAccentColor={accentColor}
        initialBrandPalette={brandPalette}
      >
        <SidebarProvider>
          <GlobalUploadDrop
            enabled={isOwner(user.roles)}
            onFilesDropped={handleGlobalDrop}
          />
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
