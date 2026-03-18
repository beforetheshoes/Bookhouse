import { Loader2 } from "lucide-react";

export function RoutePending() {
  return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
