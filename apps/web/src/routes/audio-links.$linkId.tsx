import { useState } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ReviewStatus } from "@bookhouse/domain";
import { getCurrentUserServerFn } from "../lib/auth-client";
import { createAudioLinkStatusHandler } from "../lib/library-route-actions";
import {
  getAudioLinkDetailServerFn,
  updateAudioLinkStatusServerFn,
} from "../lib/library-server";

export const Route = createFileRoute("/audio-links/$linkId")({
  loader: async ({ params, serverContext }) => {
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

    const audioLink = await getAudioLinkDetailServerFn({
      data: {
        linkId: params.linkId,
      },
    });

    if (!audioLink) {
      throw new Error("Audio link not found");
    }

    return { audioLink, user };
  },
  component: AudioLinkDetailRoute,
  notFoundComponent: () => <div>Audio link not found.</div>,
});

function AudioLinkDetailRoute() {
  const { audioLink } = Route.useLoaderData();
  const router = useRouter();
  const updateStatus = useServerFn(updateAudioLinkStatusServerFn);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Audio Link {audioLink.id}</h1>
          <p className="text-sm text-gray-600">
            {audioLink.matchType} · {audioLink.reviewStatus}
          </p>
        </div>
        <Link to="/audio-links">Back to audio review queue</Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded border border-gray-200 p-4">
          <h2 className="mb-2 font-medium">Ebook</h2>
          <p>{audioLink.ebookLabel}</p>
          <p className="text-sm text-gray-600">Authors: {audioLink.ebookAuthors.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">ISBNs: {audioLink.ebookIsbns.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">Hashes: {audioLink.ebookHashes.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">Files: {audioLink.ebookFileCount}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {audioLink.ebookPaths.map((pathValue: string) => <li key={pathValue}>{pathValue}</li>)}
          </ul>
          <Link className="mt-3 inline-block text-sm underline" to="/works/$workId" params={{ workId: audioLink.ebookWorkId }}>
            Open work
          </Link>
        </article>

        <article className="rounded border border-gray-200 p-4">
          <h2 className="mb-2 font-medium">Audiobook</h2>
          <p>{audioLink.audioLabel}</p>
          <p className="text-sm text-gray-600">Authors: {audioLink.audioAuthors.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">ISBNs: {audioLink.audioIsbns.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">Hashes: {audioLink.audioHashes.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">Files: {audioLink.audioFileCount}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {audioLink.audioPaths.map((pathValue: string) => <li key={pathValue}>{pathValue}</li>)}
          </ul>
          <Link className="mt-3 inline-block text-sm underline" to="/works/$workId" params={{ workId: audioLink.audioWorkId }}>
            Open work
          </Link>
        </article>
      </section>

      <section className="mt-6 flex gap-3 text-sm">
        <button
          disabled={pendingAction !== null}
          onClick={createAudioLinkStatusHandler({
            linkId: audioLink.id,
            pendingValue: "confirm",
            router,
            setPending: setPendingAction,
            status: ReviewStatus.CONFIRMED,
            updateStatus,
          })}
          type="button"
        >
          Confirm
        </button>
        <button
          disabled={pendingAction !== null}
          onClick={createAudioLinkStatusHandler({
            linkId: audioLink.id,
            pendingValue: "ignore",
            router,
            setPending: setPendingAction,
            status: ReviewStatus.IGNORED,
            updateStatus,
          })}
          type="button"
        >
          Ignore
        </button>
      </section>
    </main>
  );
}
