import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUserServerFn } from "../lib/auth-client";

export const Route = createFileRoute("/")({
  loader: async ({ serverContext }) => {
    const authContext = serverContext as
      | {
          auth?: {
            user?: Awaited<ReturnType<typeof getCurrentUserServerFn>>;
          };
        }
      | undefined;
    const user = authContext?.auth?.user ?? (await getCurrentUserServerFn());

    if (!user) {
      throw redirect({
        href: "/auth/login",
      });
    }

    return { user };
  },
  component: Home,
});

export function Home() {
  const { user } = Route.useLoaderData();

  return (
    <div>
      <h1>Bookhouse</h1>
      <p>Signed in as {user.name ?? user.email ?? user.subject}.</p>
      <p>{user.email ?? "No email available from your provider."}</p>
      <nav>
        <Link to="/collections">Collections</Link>
        {" · "}
        <Link to="/audio-links">Audio Link Review</Link>
        {" · "}
        <Link to="/duplicates">Duplicate Review</Link>
        {" · "}
        <Link to="/settings">Settings</Link>
      </nav>
      <form action="/auth/logout" method="post">
        <button type="submit">Log out</button>
      </form>
    </div>
  );
}
