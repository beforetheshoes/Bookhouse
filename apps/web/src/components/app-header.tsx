import { Moon, Sun } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { GlobalSearch } from "~/components/global-search";
import { useTheme } from "~/hooks/use-theme";

export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const Icon = resolvedTheme === "dark" ? Sun : Moon;
  const label = resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={label}>
      <Icon className="size-4" />
    </Button>
  );
}

export function AppHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <GlobalSearch />
      </div>
    </header>
  );
}
