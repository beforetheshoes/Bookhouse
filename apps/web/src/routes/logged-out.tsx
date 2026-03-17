import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/logged-out")({
  component: LoggedOutPage,
});

export function LoggedOutPage() {
  return (
    <div>
      <h1>Signed Out</h1>
      <p>Your local Bookhouse session has been cleared.</p>
      <a href="/auth/login">Sign in again</a>
    </div>
  );
}
