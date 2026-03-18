import { useState } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ProgressTrackingMode } from "@bookhouse/domain";
import { getCurrentUserServerFn } from "../lib/auth-client";
import { createGlobalProgressModeHandler } from "../lib/library-route-actions";
import {
  getUserProgressTrackingModeServerFn,
  updateUserProgressTrackingModeServerFn,
} from "../lib/library-server";

export const Route = createFileRoute("/settings")({
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

    const progressTrackingMode = await getUserProgressTrackingModeServerFn();
    return { progressTrackingMode, user };
  },
  component: SettingsRoute,
});

export function SettingsRoute() {
  const { progressTrackingMode } = Route.useLoaderData();
  const router = useRouter();
  const updateMode = useServerFn(updateUserProgressTrackingModeServerFn);
  const [pending, setPending] = useState(false);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-gray-600">Choose how reading progress is tracked across formats.</p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link to="/collections">Collections</Link>
          <Link to="/audio-links">Audio Link Review</Link>
          <Link to="/duplicates">Duplicate Review</Link>
        </nav>
      </header>

      <section className="space-y-3 rounded border border-gray-200 p-4">
        <p className="font-medium">Global Progress Mode</p>
        <p className="text-sm text-gray-600">Current: {progressTrackingMode}</p>
        <div className="flex gap-3 text-sm">
          <button
            disabled={pending}
            onClick={createGlobalProgressModeHandler({
              progressTrackingMode: ProgressTrackingMode.BY_EDITION,
              router,
              setPending,
              updateMode,
            })}
            type="button"
          >
            Track by edition
          </button>
          <button
            disabled={pending}
            onClick={createGlobalProgressModeHandler({
              progressTrackingMode: ProgressTrackingMode.BY_WORK,
              router,
              setPending,
              updateMode,
            })}
            type="button"
          >
            Track by work
          </button>
        </div>
      </section>
    </main>
  );
}
