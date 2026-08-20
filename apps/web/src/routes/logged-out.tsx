import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/logged-out")({
  component: LoggedOutPage,
});

export function LoggedOutPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl font-medium">Signed Out</h1>
      <p className="text-muted-foreground">
        Your local Bookhouse session has been cleared.
      </p>
      <a className="text-primary underline underline-offset-4" href="/auth/login">
        Sign in again
      </a>
    </div>
  );
}
