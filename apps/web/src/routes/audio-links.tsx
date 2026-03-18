import { useState } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ReviewStatus } from "@bookhouse/domain";
import { getCurrentUserServerFn } from "../lib/auth-client";
import { createAudioLinkStatusHandler } from "../lib/library-route-actions";
import {
  listAudioLinksServerFn,
  updateAudioLinkStatusServerFn,
} from "../lib/library-server";

function getSearchParam(
  location: {
    search?: unknown;
    searchStr?: string;
  },
  key: string,
): string | null {
  if (typeof location.searchStr === "string") {
    return new URLSearchParams(location.searchStr).get(key);
  }

  if (typeof location.search === "string") {
    return new URLSearchParams(location.search).get(key);
  }

  if (location.search && typeof location.search === "object") {
    const value = (location.search as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
  }

  return null;
}

export const Route = createFileRoute("/audio-links")({
  loader: async ({ location, serverContext }) => {
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

    const status = (getSearchParam(location, "status") as ReviewStatus | "ALL" | null) ?? ReviewStatus.PENDING;
    const audioLinks = await listAudioLinksServerFn({
      data: {
        status,
      },
    });

    return { audioLinks, status, user };
  },
  component: AudioLinksRoute,
});

export function AudioLinksRoute() {
  const { audioLinks, status } = Route.useLoaderData();
  const router = useRouter();
  const updateStatus = useServerFn(updateAudioLinkStatusServerFn);
  const [pendingLinkId, setPendingLinkId] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Audio Link Review</h1>
          <p className="text-sm text-gray-600">
            Reviewing {status.toLowerCase()} audio link candidates.
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link to="/library">Library</Link>
          <Link to="/">Home</Link>
          <Link to="/duplicates">Duplicate Review</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>

      <section className="mb-6 flex gap-3 text-sm">
        <a href={`/audio-links?status=${ReviewStatus.PENDING}`}>Pending</a>
        <a href={`/audio-links?status=${ReviewStatus.CONFIRMED}`}>Confirmed</a>
        <a href={`/audio-links?status=${ReviewStatus.IGNORED}`}>Ignored</a>
        <a href="/audio-links?status=ALL">All</a>
      </section>

      <div className="space-y-4">
        {audioLinks.map((audioLink) => (
          <article key={audioLink.id} className="rounded border border-gray-200 p-4">
            <div className="mb-2 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{audioLink.ebookLabel} to {audioLink.audioLabel}</p>
                <p className="text-sm text-gray-600">
                  {audioLink.matchType} · {audioLink.reviewStatus}
                  {audioLink.confidence === null ? "" : ` · confidence ${audioLink.confidence.toFixed(2)}`}
                </p>
              </div>
              <Link className="text-sm underline" to="/audio-links/$linkId" params={{ linkId: audioLink.id }}>
                Review
              </Link>
            </div>

            <div className="flex gap-3 text-sm">
              <button
                disabled={pendingLinkId === audioLink.id}
                onClick={createAudioLinkStatusHandler({
                  linkId: audioLink.id,
                  pendingValue: audioLink.id,
                  router,
                  setPending: setPendingLinkId,
                  status: ReviewStatus.CONFIRMED,
                  updateStatus,
                })}
                type="button"
              >
                Confirm
              </button>
              <button
                disabled={pendingLinkId === audioLink.id}
                onClick={createAudioLinkStatusHandler({
                  linkId: audioLink.id,
                  pendingValue: audioLink.id,
                  router,
                  setPending: setPendingLinkId,
                  status: ReviewStatus.IGNORED,
                  updateStatus,
                })}
                type="button"
              >
                Ignore
              </button>
            </div>
          </article>
        ))}

        {audioLinks.length === 0 ? (
          <p className="text-sm text-gray-600">No audio links match the current filter.</p>
        ) : null}
      </div>
    </main>
  );
}
