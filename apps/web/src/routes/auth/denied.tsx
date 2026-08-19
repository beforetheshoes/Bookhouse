import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/denied")({
  component: AccessDeniedPage,
});

export function AccessDeniedPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl font-medium">Access denied</h1>
      <p className="text-muted-foreground">
        Your email is not authorized to access this Bookhouse library. Ask the
        library owner to add your email to the allowlist.
      </p>
      <a className="text-primary underline underline-offset-4" href="/auth/login">
        Try again with a different account
      </a>
    </div>
  );
}
