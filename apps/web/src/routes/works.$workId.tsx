import { useState } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ProgressTrackingMode } from "@bookhouse/domain";
import { getCurrentUserServerFn } from "../lib/auth-client";
import { createWorkProgressModeHandler } from "../lib/library-route-actions";
import {
  getWorkProgressViewServerFn,
  updateWorkProgressTrackingModeServerFn,
} from "../lib/library-server";

export const Route = createFileRoute("/works/$workId")({
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

    const work = await getWorkProgressViewServerFn({
      data: {
        workId: params.workId,
      },
    });

    if (!work) {
      throw new Error("Work not found");
    }

    return { user, work };
  },
  component: WorkDetailRoute,
});

export function WorkDetailRoute() {
  const { work } = Route.useLoaderData();
  const router = useRouter();
  const updateMode = useServerFn(updateWorkProgressTrackingModeServerFn);
  const [pending, setPending] = useState(false);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{work.workTitle}</h1>
          <p className="text-sm text-gray-600">
            Effective mode: {work.effectiveMode} · Global: {work.globalMode}
            {work.overrideMode ? ` · Override: ${work.overrideMode}` : ""}
          </p>
        </div>
        <Link to="/settings">Settings</Link>
      </header>

      <section className="mb-6 space-y-3 rounded border border-gray-200 p-4">
        <p className="font-medium">Per-work override</p>
        <div className="flex gap-3 text-sm">
          <button
            disabled={pending}
            onClick={createWorkProgressModeHandler({
              progressTrackingMode: null,
              router,
              setPending,
              updateMode,
              workId: work.workId,
            })}
            type="button"
          >
            Use global default
          </button>
          <button
            disabled={pending}
            onClick={createWorkProgressModeHandler({
              progressTrackingMode: ProgressTrackingMode.BY_EDITION,
              router,
              setPending,
              updateMode,
              workId: work.workId,
            })}
            type="button"
          >
            Force by edition
          </button>
          <button
            disabled={pending}
            onClick={createWorkProgressModeHandler({
              progressTrackingMode: ProgressTrackingMode.BY_WORK,
              router,
              setPending,
              updateMode,
              workId: work.workId,
            })}
            type="button"
          >
            Force by work
          </button>
        </div>
      </section>

      <section className="mb-6 rounded border border-gray-200 p-4">
        <p className="font-medium">Unified summary</p>
        {work.summary ? (
          <p className="text-sm text-gray-600">
            {work.summary.progressKind} · {work.summary.percent ?? 0}% · {work.summary.updatedAt}
          </p>
        ) : (
          <p className="text-sm text-gray-600">No progress recorded for this work.</p>
        )}
      </section>

      <section className="space-y-3">
        {work.progressRows.map((progressRow) => (
          <article key={progressRow.id} className="rounded border border-gray-200 p-4 text-sm">
            <p>{progressRow.progressKind} · {progressRow.formatFamily}</p>
            <p className="text-gray-600">Edition {progressRow.editionId}</p>
            <p className="text-gray-600">Percent: {progressRow.percent ?? 0}</p>
            <p className="text-gray-600">Updated: {progressRow.updatedAt}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
