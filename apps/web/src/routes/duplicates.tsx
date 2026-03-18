import { useState } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { DuplicateReason, ReviewStatus } from "@bookhouse/domain";
import { getCurrentUserServerFn } from "../lib/auth-client";
import { createDuplicateStatusHandler } from "../lib/library-route-actions";
import {
  listDuplicateCandidatesServerFn,
  updateDuplicateCandidateStatusServerFn,
} from "../lib/library-server";

export const Route = createFileRoute("/duplicates")({
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

    const url = new URL(`https://bookhouse.example${location.pathname}${location.search}`);
    const status = (url.searchParams.get("status") as ReviewStatus | "ALL" | null) ?? ReviewStatus.PENDING;
    const reason = (url.searchParams.get("reason") as DuplicateReason | "ALL" | null) ?? "ALL";
    const candidates = await listDuplicateCandidatesServerFn({
      data: {
        reason,
        status,
      },
    });

    return { candidates, reason, status, user };
  },
  component: DuplicatesRoute,
});

export function DuplicatesRoute() {
  const { candidates, reason, status } = Route.useLoaderData();
  const router = useRouter();
  const updateStatus = useServerFn(updateDuplicateCandidateStatusServerFn);
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Duplicate Review</h1>
          <p className="text-sm text-gray-600">
            Reviewing {status.toLowerCase()} candidates{reason === "ALL" ? "" : ` for ${reason}`}.
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link to="/library">Library</Link>
          <Link to="/">Home</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>

      <section className="mb-6 flex gap-3 text-sm">
        <a href={`/duplicates?status=${ReviewStatus.PENDING}`}>Pending</a>
        <a href={`/duplicates?status=${ReviewStatus.CONFIRMED}`}>Confirmed</a>
        <a href={`/duplicates?status=${ReviewStatus.IGNORED}`}>Ignored</a>
        <a href="/duplicates?status=ALL">All</a>
      </section>

      <div className="space-y-4">
        {candidates.map((candidate) => (
          <article key={candidate.id} className="rounded border border-gray-200 p-4">
            <div className="mb-2 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{candidate.leftLabel} vs {candidate.rightLabel}</p>
                <p className="text-sm text-gray-600">
                  {candidate.reason} · {candidate.status}
                  {candidate.confidence === null ? "" : ` · confidence ${candidate.confidence.toFixed(2)}`}
                </p>
              </div>
              <Link className="text-sm underline" to="/duplicates/$candidateId" params={{ candidateId: candidate.id }}>
                Review
              </Link>
            </div>

            <div className="flex gap-3 text-sm">
              <button
                disabled={pendingCandidateId === candidate.id}
                onClick={createDuplicateStatusHandler({
                  candidateId: candidate.id,
                  pendingValue: candidate.id,
                  router,
                  setPending: setPendingCandidateId,
                  status: ReviewStatus.CONFIRMED,
                  updateStatus,
                })}
                type="button"
              >
                Confirm
              </button>
              <button
                disabled={pendingCandidateId === candidate.id}
                onClick={createDuplicateStatusHandler({
                  candidateId: candidate.id,
                  pendingValue: candidate.id,
                  router,
                  setPending: setPendingCandidateId,
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

        {candidates.length === 0 ? (
          <p className="text-sm text-gray-600">No duplicate candidates match the current filter.</p>
        ) : null}
      </div>
    </main>
  );
}
