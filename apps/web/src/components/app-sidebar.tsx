import { Link, useRouterState } from "@tanstack/react-router";
import type { AuthenticatedUser } from "@bookhouse/auth";
import {
  Activity,
  BookCopy,
  BookOpen,
  Copy,
  FolderOpen,
  Headphones,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { BookhouseMark } from "~/components/branding/bookhouse-mark";
import { useAppColor } from "~/hooks/use-app-color";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

const navItems = [
  { title: "Library", href: "/library", icon: BookOpen, ownerOnly: false },
  { title: "Series", href: "/series", icon: BookCopy, ownerOnly: false },
  { title: "Authors", href: "/authors", icon: Users, ownerOnly: false },
  { title: "Shelves", href: "/shelves", icon: FolderOpen, ownerOnly: false },
  { title: "Duplicates", href: "/duplicates", icon: Copy, ownerOnly: true },
  { title: "Match Suggestions", href: "/match-suggestions", icon: Headphones, ownerOnly: true },
  { title: "Library Health", href: "/health", icon: Activity, ownerOnly: true },
  { title: "Settings", href: "/settings", icon: Settings, ownerOnly: false },
] as const;

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return "?";
}

export function AppSidebar({ user }: { user: AuthenticatedUser }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { brandPalette } = useAppColor();
  const isOwner = user.roles.includes("OWNER");
  const visibleNavItems = navItems.filter((item) => !item.ownerOnly || isOwner);

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/library" search={{ page: 1, pageSize: 50, sort: "title-asc" as const, view: "works" as const }}>
                <div className="flex aspect-square size-8 items-center justify-center">
                  <BookhouseMark size={28} paletteKey={brandPalette} dark title="Bookhouse" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-display text-base font-medium tracking-tight">Bookhouse</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath.startsWith(item.href)}
                  >
                    <Link to={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage
                      src={user.image ?? undefined}
                      alt={user.name ?? "User"}
                    />
                    <AvatarFallback className="rounded-lg">
                      {getInitials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user.name ?? "User"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email ?? ""}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side="top"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem asChild>
                  <form action="/auth/logout" method="post" className="w-full">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2"
                    >
                      <LogOut className="size-4" />
                      Log out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
