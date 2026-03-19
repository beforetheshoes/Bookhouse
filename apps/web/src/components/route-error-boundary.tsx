import { useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";

export function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  const message =
    import.meta.env.DEV && error instanceof Error
      ? error.message
      : "An unexpected error occurred. Please try again.";

  return (
    <div className="flex items-center justify-center p-12">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
