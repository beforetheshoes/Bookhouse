import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div>
      <h1>Bookhouse</h1>
      <p>Welcome to Bookhouse.</p>
    </div>
  );
}
