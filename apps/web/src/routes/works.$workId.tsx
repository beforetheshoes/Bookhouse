import { useState, type FormEvent } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ProgressTrackingMode } from "@bookhouse/domain";
import { getCurrentUserServerFn } from "../lib/auth-client";
import {
  createCollectionMembershipHandler,
  createExternalLinkMutationHandler,
  createWorkProgressModeHandler,
} from "../lib/library-route-actions";
import {
  addWorkToCollectionServerFn,
  createExternalLinkServerFn,
  deleteExternalLinkServerFn,
  getWorkProgressViewServerFn,
  removeWorkFromCollectionServerFn,
  updateExternalLinkServerFn,
  updateWorkProgressTrackingModeServerFn,
} from "../lib/library-server";
import type { WorkProgressView } from "../lib/library-service";

function formatMetadataDisplay(metadata: string): string {
  return metadata === "" ? "None" : metadata;
}

function getFormStringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function getOptionalFormStringValue(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

export function createExternalLinkCreateSubmitHandler(input: {
  createExternalLink: (input: {
    data: {
      editionId: string;
      externalId: string;
      lastSyncedAt: string | null;
      metadata: string;
      provider: string;
    };
  }) => Promise<unknown>;
  editionId: string;
  router: Parameters<typeof createExternalLinkMutationHandler>[0]["router"];
  setPending: (value: string | null) => void;
}) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    createExternalLinkMutationHandler({
      action: async () => {
        await input.createExternalLink({
          data: {
            editionId: input.editionId,
            externalId: getFormStringValue(formData, "externalId"),
            lastSyncedAt: getOptionalFormStringValue(formData, "lastSyncedAt"),
            metadata: getFormStringValue(formData, "metadata"),
            provider: getFormStringValue(formData, "provider"),
          },
        });
        form.reset();
      },
      pendingValue: `create:${input.editionId}`,
      router: input.router,
      setPending: input.setPending,
    })();
  };
}

export function createExternalLinkUpdateSubmitHandler(input: {
  linkId: string;
  router: Parameters<typeof createExternalLinkMutationHandler>[0]["router"];
  setPending: (value: string | null) => void;
  updateExternalLink: (input: {
    data: {
      externalId: string;
      lastSyncedAt: string | null;
      linkId: string;
      metadata: string;
      provider: string;
    };
  }) => Promise<unknown>;
}) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    createExternalLinkMutationHandler({
      action: async () => {
        await input.updateExternalLink({
          data: {
            externalId: getFormStringValue(formData, "externalId"),
            lastSyncedAt: getOptionalFormStringValue(formData, "lastSyncedAt"),
            linkId: input.linkId,
            metadata: getFormStringValue(formData, "metadata"),
            provider: getFormStringValue(formData, "provider"),
          },
        });
      },
      pendingValue: `update:${input.linkId}`,
      router: input.router,
      setPending: input.setPending,
    })();
  };
}

export function createExternalLinkDeleteClickHandler(input: {
  deleteExternalLink: (input: { data: { linkId: string } }) => Promise<unknown>;
  linkId: string;
  router: Parameters<typeof createExternalLinkMutationHandler>[0]["router"];
  setPending: (value: string | null) => void;
}) {
  return () => {
    createExternalLinkMutationHandler({
      action: async () => {
        await input.deleteExternalLink({
          data: { linkId: input.linkId },
        });
      },
      pendingValue: `delete:${input.linkId}`,
      router: input.router,
      setPending: input.setPending,
    })();
  };
}

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
  const { work } = Route.useLoaderData() as { work: WorkProgressView };
  const router = useRouter();
  const addToCollection = useServerFn(addWorkToCollectionServerFn);
  const createExternalLink = useServerFn(createExternalLinkServerFn);
  const deleteExternalLink = useServerFn(deleteExternalLinkServerFn);
  const removeFromCollection = useServerFn(removeWorkFromCollectionServerFn);
  const updateExternalLink = useServerFn(updateExternalLinkServerFn);
  const updateMode = useServerFn(updateWorkProgressTrackingModeServerFn);
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null);
  const [pendingExternalLinkAction, setPendingExternalLinkAction] = useState<string | null>(null);
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
        <nav className="flex gap-3 text-sm">
          <Link to="/collections">Collections</Link>
          <Link to="/settings">Settings</Link>
        </nav>
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-medium">Collections</p>
          <Link className="text-sm underline" to="/collections">Manage shelves</Link>
        </div>
        <div className="space-y-3 text-sm">
          {work.collections.map((collection) => (
            <div key={collection.id} className="flex items-center justify-between gap-3">
              <div>
                <p>{collection.name}</p>
                <p className="text-gray-600">
                  {collection.itemCount} item{collection.itemCount === 1 ? "" : "s"}
                  {collection.containsWork ? " · On this shelf" : ""}
                </p>
              </div>
              <button
                disabled={pendingCollectionId === collection.id}
                onClick={createCollectionMembershipHandler({
                  action: collection.containsWork ? removeFromCollection : addToCollection,
                  collectionId: collection.id,
                  router,
                  setPending: setPendingCollectionId,
                  workId: work.workId,
                })}
                type="button"
              >
                {collection.containsWork ? "Remove" : "Add"}
              </button>
            </div>
          ))}
          {work.collections.length === 0 ? (
            <p className="text-gray-600">No shelves yet. Create one from the collections page.</p>
          ) : null}
        </div>
      </section>

      <section className="mb-6 rounded border border-gray-200 p-4">
        <div className="mb-3">
          <p className="font-medium">External links</p>
          <p className="text-sm text-gray-600">
            Manage edition-level links from external providers.
          </p>
        </div>
        <div className="space-y-4">
          {work.editions.map((edition) => (
            <article key={edition.id} className="rounded border border-gray-200 p-4">
              <div className="mb-3">
                <p className="font-medium">{edition.formatFamily} edition {edition.id}</p>
                <p className="text-sm text-gray-600">
                  ISBN-13: {edition.isbn13 ?? "None"} · ISBN-10: {edition.isbn10 ?? "None"} · ASIN: {edition.asin ?? "None"}
                </p>
                <p className="text-sm text-gray-600">
                  Publisher: {edition.publisher ?? "None"} · Published: {edition.publishedAt ?? "None"}
                </p>
              </div>

              <div className="space-y-4">
                {edition.externalLinks.map((externalLink) => (
                  <form
                    key={externalLink.id}
                    className="rounded border border-gray-200 p-3 text-sm"
                    onSubmit={createExternalLinkUpdateSubmitHandler({
                      linkId: externalLink.id,
                      router,
                      setPending: setPendingExternalLinkAction,
                      updateExternalLink,
                    })}
                  >
                    <p className="mb-2 font-medium">External link {externalLink.id}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span>Provider</span>
                        <input
                          defaultValue={externalLink.provider}
                          disabled={pendingExternalLinkAction !== null}
                          name="provider"
                          type="text"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span>External ID</span>
                        <input
                          defaultValue={externalLink.externalId}
                          disabled={pendingExternalLinkAction !== null}
                          name="externalId"
                          type="text"
                        />
                      </label>
                      <label className="flex flex-col gap-1 md:col-span-2">
                        <span>Metadata (JSON)</span>
                        <textarea
                          defaultValue={externalLink.metadata}
                          disabled={pendingExternalLinkAction !== null}
                          name="metadata"
                          rows={4}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span>Last synced at</span>
                        <input
                          defaultValue={externalLink.lastSyncedAt?.slice(0, 16) ?? ""}
                          disabled={pendingExternalLinkAction !== null}
                          name="lastSyncedAt"
                          type="datetime-local"
                        />
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-gray-600">
                      Current metadata: {formatMetadataDisplay(externalLink.metadata)}
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        disabled={pendingExternalLinkAction !== null}
                        type="submit"
                      >
                        Save link
                      </button>
                      <button
                        disabled={pendingExternalLinkAction !== null}
                        onClick={createExternalLinkDeleteClickHandler({
                          deleteExternalLink,
                          linkId: externalLink.id,
                          router,
                          setPending: setPendingExternalLinkAction,
                        })}
                        type="button"
                      >
                        Delete link
                      </button>
                    </div>
                  </form>
                ))}

                {edition.externalLinks.length === 0 ? (
                  <p className="text-sm text-gray-600">No external links for this edition.</p>
                ) : null}

                <form
                  className="rounded border border-dashed border-gray-300 p-3 text-sm"
                  onSubmit={createExternalLinkCreateSubmitHandler({
                    createExternalLink,
                    editionId: edition.id,
                    router,
                    setPending: setPendingExternalLinkAction,
                  })}
                >
                  <p className="mb-2 font-medium">Add external link</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span>Provider</span>
                      <input disabled={pendingExternalLinkAction !== null} name="provider" type="text" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span>External ID</span>
                      <input disabled={pendingExternalLinkAction !== null} name="externalId" type="text" />
                    </label>
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span>Metadata (JSON)</span>
                      <textarea
                        defaultValue=""
                        disabled={pendingExternalLinkAction !== null}
                        name="metadata"
                        placeholder='{"rating": 5}'
                        rows={4}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span>Last synced at</span>
                      <input
                        disabled={pendingExternalLinkAction !== null}
                        name="lastSyncedAt"
                        type="datetime-local"
                      />
                    </label>
                  </div>
                  <button
                    className="mt-3"
                    disabled={pendingExternalLinkAction !== null}
                    type="submit"
                  >
                    Add link
                  </button>
                </form>
              </div>
            </article>
          ))}
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
