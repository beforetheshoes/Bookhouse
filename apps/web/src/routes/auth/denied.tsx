import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/denied")({
  component: AccessDeniedPage,
});

export function AccessDeniedPage() {
  return (
    <div>
      <h1>Access denied</h1>
      <p>
        Your email is not authorized to access this Bookhouse library. Ask the
        library owner to add your email to the allowlist.
      </p>
      <a href="/auth/login">Try again with a different account</a>
    </div>
  );
}
