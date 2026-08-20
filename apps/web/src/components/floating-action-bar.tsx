import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

/**
 * The floating bar that appears above the page when rows are selected.
 *
 * It spans the content column at every width rather than sizing to its
 * content. Centring with `left-1/2 -translate-x-1/2` only works while the bar
 * is narrower than the viewport, and a bulk-action row is not: with seven
 * whitespace-nowrap buttons it measures ~884px, so it overhung both edges on a
 * phone and stayed clipped up to ~900px wide — and a `fixed` element cannot be
 * scrolled back into view.
 *
 * From `md` the sidebar is a docked rail rather than a sheet, so the bar also
 * starts after it. Full-bleed there would cover the sidebar footer (the
 * account menu) for as long as a selection was active.
 */
export function FloatingActionBar({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "fixed inset-x-2 bottom-2 z-50 flex flex-col items-center gap-1.5 rounded-lg border bg-background p-3 shadow-lg",
        "md:inset-x-6 md:bottom-6",
        "md:group-data-[sidebar-state=expanded]/sidebar-wrapper:left-[calc(var(--sidebar-width)+(--spacing(6)))]",
        className,
      )}
      {...props}
    />
  );
}
