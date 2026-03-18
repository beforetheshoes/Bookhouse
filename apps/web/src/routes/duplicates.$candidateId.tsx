import { useState } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ReviewStatus } from "@bookhouse/domain";
import { getCurrentUserServerFn } from "../lib/auth-client";
import {
  createDuplicateMergeHandler,
  createDuplicateStatusHandler,
} from "../lib/library-route-actions";
import {
  getDuplicateCandidateDetailServerFn,
  mergeDuplicateCandidateServerFn,
  updateDuplicateCandidateStatusServerFn,
} from "../lib/library-server";

export const Route = createFileRoute("/duplicates/$candidateId")({
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

    const candidate = await getDuplicateCandidateDetailServerFn({
      data: {
        candidateId: params.candidateId,
      },
    });

    if (!candidate) {
      throw new Error("Duplicate candidate not found");
    }

    return { candidate, user };
  },
  component: DuplicateDetailRoute,
  notFoundComponent: () => <div>Duplicate candidate not found.</div>,
});

function DuplicateDetailRoute() {
  const { candidate } = Route.useLoaderData();
  const router = useRouter();
  const mergeCandidate = useServerFn(mergeDuplicateCandidateServerFn);
  const updateStatus = useServerFn(updateDuplicateCandidateStatusServerFn);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Candidate {candidate.id}</h1>
          <p className="text-sm text-gray-600">
            {candidate.reason} · {candidate.status}
          </p>
        </div>
        <Link to="/duplicates">Back to review queue</Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded border border-gray-200 p-4">
          <h2 className="mb-2 font-medium">Left</h2>
          <p>{candidate.leftLabel}</p>
          <p className="text-sm text-gray-600">Authors: {candidate.leftAuthors.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">ISBNs: {candidate.leftIsbns.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">Hashes: {candidate.leftHashes.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">Files: {candidate.leftFileCount}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {candidate.leftPaths.map((pathValue) => <li key={pathValue}>{pathValue}</li>)}
          </ul>
          {candidate.leftWorkId ? (
            <Link className="mt-3 inline-block text-sm underline" to="/works/$workId" params={{ workId: candidate.leftWorkId }}>
              Open work
            </Link>
          ) : null}
        </article>

        <article className="rounded border border-gray-200 p-4">
          <h2 className="mb-2 font-medium">Right</h2>
          <p>{candidate.rightLabel}</p>
          <p className="text-sm text-gray-600">Authors: {candidate.rightAuthors.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">ISBNs: {candidate.rightIsbns.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">Hashes: {candidate.rightHashes.join(", ") || "None"}</p>
          <p className="text-sm text-gray-600">Files: {candidate.rightFileCount}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {candidate.rightPaths.map((pathValue) => <li key={pathValue}>{pathValue}</li>)}
          </ul>
          {candidate.rightWorkId ? (
            <Link className="mt-3 inline-block text-sm underline" to="/works/$workId" params={{ workId: candidate.rightWorkId }}>
              Open work
            </Link>
          ) : null}
        </article>
      </section>

      <section className="mt-6 flex gap-3 text-sm">
        <button
          disabled={pendingAction !== null}
          onClick={createDuplicateStatusHandler({
            candidateId: candidate.id,
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
          onClick={createDuplicateStatusHandler({
            candidateId: candidate.id,
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
        {candidate.mergeable ? (
          <>
            <button
              disabled={pendingAction !== null}
              onClick={createDuplicateMergeHandler({
                candidateId: candidate.id,
                pendingValue: "merge-left",
                router,
                setPending: setPendingAction,
                survivorSide: "left",
                mergeCandidate,
              })}
              type="button"
            >
              Keep left
            </button>
            <button
              disabled={pendingAction !== null}
              onClick={createDuplicateMergeHandler({
                candidateId: candidate.id,
                pendingValue: "merge-right",
                router,
                setPending: setPendingAction,
                survivorSide: "right",
                mergeCandidate,
              })}
              type="button"
            >
              Keep right
            </button>
          </>
        ) : null}
      </section>
    </main>
  );
}
