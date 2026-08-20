import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

/**
 * The floating bar that appears above the page when rows are selected.
 *
 * Centring with `left-1/2 -translate-x-1/2` only works while the bar is
 * narrower than the viewport. A bulk-action row is not: with seven
 * whitespace-nowrap buttons it is roughly 700px wide, so on a phone it
 * overhung both edges at once and the outermost buttons could not be reached
 * — a `fixed` element does not scroll back into view. Below `md` it is pinned
 * to the viewport edges instead and allowed to wrap.
 */
export function FloatingActionBar({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "fixed inset-x-2 bottom-2 z-50 flex flex-col items-center gap-1.5 rounded-lg border bg-background p-3 shadow-lg",
        "md:inset-x-auto md:bottom-6 md:left-1/2 md:w-auto md:-translate-x-1/2",
        className,
      )}
      {...props}
    />
  );
}
