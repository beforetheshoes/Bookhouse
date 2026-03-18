import { useState, type FormEvent } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ProgressTrackingMode,
  type ContributorRole,
  type EditionFileRole,
  type FormatFamily,
  type MediaKind,
  type ProgressKind,
} from "@bookhouse/domain";
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

function formatFormatFamily(formatFamily: FormatFamily): string {
  return formatFormatFamilyLabel(formatFamily).toLowerCase();
}

function formatFormatFamilyLabel(formatFamily: FormatFamily): string {
  return formatFamily === "AUDIOBOOK" ? "Audiobook" : "Ebook";
}

function formatProgressKind(progressKind: ProgressKind): string {
  if (progressKind === "READALOUD") {
    return "read aloud";
  }

  return progressKind.toLowerCase();
}

function formatPercent(percent: number | null): string {
  return `${Math.round((percent ?? 0) * 100)}%`;
}

function formatDateTime(value: string | null): string {
  if (value === null) {
    return "None";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 16).replace("T", " ");
}

function formatDate(value: string | null): string {
  if (value === null) {
    return "None";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function formatContributorRole(role: ContributorRole): string {
  return role.toLowerCase().replaceAll("_", " ");
}

function formatEditionFileRole(role: EditionFileRole): string {
  return role.toLowerCase().replaceAll("_", " ");
}

function formatMediaKind(mediaKind: MediaKind): string {
  return mediaKind.toLowerCase();
}

function formatBytes(sizeBytes: string | null): string {
  if (sizeBytes === null) {
    return "Unknown size";
  }

  const value = Number(sizeBytes);

  if (!Number.isFinite(value)) {
    return `${sizeBytes} B`;
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatMode(mode: ProgressTrackingMode): string {
  return mode === ProgressTrackingMode.BY_WORK ? "By work" : "By edition";
}

function formatProgressSummary(work: WorkProgressView): string {
  if (work.summary === null) {
    return "No progress recorded for this work.";
  }

  return `${formatPercent(work.summary.percent)} ${formatProgressKind(work.summary.progressKind)}${work.summary.source === null ? "" : ` via ${work.summary.source}`} · Updated ${formatDateTime(work.summary.updatedAt)}`;
}

function getPrimaryContributors(work: WorkProgressView, role: ContributorRole): string[] {
  return work.contributorGroups.find((group) => group.role === role)?.names ?? [];
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
  const authors = getPrimaryContributors(work, "AUTHOR");
  const narrators = getPrimaryContributors(work, "NARRATOR");

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8 overflow-hidden rounded-3xl border border-stone-200 bg-linear-to-br from-amber-50 via-white to-sky-50 p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Book Detail</p>
              <h1 className="font-serif text-4xl text-stone-900">{work.workTitle}</h1>
              <p className="text-base text-stone-600">
                {authors.length === 0 ? "Unknown author" : authors.join(", ")}
                {narrators.length === 0 ? "" : ` · Narrated by ${narrators.join(", ")}`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm text-stone-700">
              {work.series ? <span className="rounded-full bg-white/90 px-3 py-1 shadow-sm">Series: {work.series.name}</span> : null}
              <span className="rounded-full bg-white/90 px-3 py-1 shadow-sm">
                Formats: {work.formatFamilies.length === 0 ? "None" : work.formatFamilies.map(formatFormatFamily).join(", ")}
              </span>
              <span className="rounded-full bg-white/90 px-3 py-1 shadow-sm">
                Shelves: {work.collections.filter((collection) => collection.containsWork).map((collection) => collection.name).join(", ") || "No shelves"}
              </span>
              <span className="rounded-full bg-white/90 px-3 py-1 shadow-sm">
                Effective mode: {formatMode(work.effectiveMode)}
              </span>
            </div>

            <dl className="grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-stone-900">Language</dt>
                <dd>{work.language ?? "None"}</dd>
              </div>
              <div>
                <dt className="font-medium text-stone-900">Sort title</dt>
                <dd>{work.sortTitle ?? "None"}</dd>
              </div>
            </dl>

            <p className="max-w-3xl text-sm leading-7 text-stone-700">
              {work.description ?? "No description recorded for this work yet."}
            </p>
          </div>

          <nav className="flex gap-3 text-sm text-stone-700">
            <Link className="underline" to="/library">Library</Link>
            <Link className="underline" to="/collections">Collections</Link>
            <Link className="underline" to="/settings">Settings</Link>
          </nav>
        </div>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <article className="rounded-2xl border border-stone-200 bg-white/90 p-5">
            <p className="text-sm font-medium text-stone-900">Current progress</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {work.summary ? formatPercent(work.summary.percent) : "No progress yet"}
            </p>
            <p className="mt-1 text-sm text-stone-600">{formatProgressSummary(work)}</p>
          </article>

          <article className="rounded-2xl border border-stone-200 bg-stone-950 p-5 text-stone-50">
            <p className="text-sm font-medium text-stone-100">Contributor credits</p>
            <div className="mt-3 space-y-2 text-sm text-stone-300">
              {work.contributorGroups.length === 0 ? (
                <p>No contributor credits captured yet.</p>
              ) : (
                work.contributorGroups.map((group) => (
                  <p key={group.role}>
                    <span className="font-medium text-stone-50">{formatContributorRole(group.role)}:</span>
                    {" "}
                    {group.names.join(", ")}
                  </p>
                ))
              )}
            </div>
          </article>
        </section>
      </header>

      <section className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-stone-900">Reading state</h2>
              <p className="text-sm text-stone-600">Summary and history across editions.</p>
            </div>
            <p className="text-sm text-stone-500">Global mode: {formatMode(work.globalMode)}</p>
          </div>

          <div className="mb-5 rounded-2xl bg-stone-50 p-4 text-sm text-stone-700">
            {work.overrideMode ? (
              <p>Per-work override active: {formatMode(work.overrideMode)}</p>
            ) : (
              <p>This work uses the global progress tracking default.</p>
            )}
          </div>

          <div className="mb-6 flex flex-wrap gap-3 text-sm">
            <button
              className="rounded-full border border-stone-300 px-4 py-2"
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
              className="rounded-full border border-stone-300 px-4 py-2"
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
              className="rounded-full border border-stone-300 px-4 py-2"
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

          <div className="space-y-3">
            {work.progressRows.length === 0 ? (
              <p className="text-sm text-stone-600">No progress recorded for this work.</p>
            ) : (
              work.progressRows.map((progressRow) => (
                <article key={progressRow.id} className="rounded-2xl border border-stone-200 p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">
                        {formatPercent(progressRow.percent)} {formatProgressKind(progressRow.progressKind)}
                      </p>
                      <p className="text-stone-600">
                        {formatFormatFamilyLabel(progressRow.formatFamily)} edition {progressRow.editionId}
                      </p>
                    </div>
                    <p className="text-stone-500">Updated {formatDateTime(progressRow.updatedAt)}</p>
                  </div>
                  <p className="mt-2 text-stone-600">
                    Source: {progressRow.source ?? "Manual"} · Locator keys: {Object.keys(progressRow.locator).join(", ") || "None"}
                  </p>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-stone-900">Shelves</h2>
              <p className="text-sm text-stone-600">Manage collection membership for this work.</p>
            </div>
            <Link className="text-sm underline text-stone-700" to="/collections">Manage shelves</Link>
          </div>

          <div className="space-y-3 text-sm">
            {work.collections.map((collection) => (
              <div key={collection.id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 p-4">
                <div>
                  <p className="font-medium text-stone-900">{collection.name}</p>
                  <p className="text-stone-600">
                    {collection.itemCount} item{collection.itemCount === 1 ? "" : "s"}
                    {collection.containsWork ? " · On this shelf" : ""}
                  </p>
                </div>
                <button
                  className="rounded-full border border-stone-300 px-4 py-2"
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
              <p className="text-stone-600">No shelves yet. Create one from the collections page.</p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-stone-900">Editions</h2>
            <p className="text-sm text-stone-600">Operational detail, files, and external links by edition.</p>
          </div>
          <p className="text-sm text-stone-500">{work.editions.length} edition{work.editions.length === 1 ? "" : "s"}</p>
        </div>

        {work.editions.map((edition) => (
          <article key={edition.id} className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-200 bg-stone-50 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-stone-900">
                    {formatFormatFamilyLabel(edition.formatFamily)} edition {edition.id}
                  </p>
                  <p className="text-sm text-stone-600">
                    ISBN-13: {edition.isbn13 ?? "None"} · ISBN-10: {edition.isbn10 ?? "None"} · ASIN: {edition.asin ?? "None"}
                  </p>
                  <p className="text-sm text-stone-600">
                    Publisher: {edition.publisher ?? "None"} · Published: {formatDate(edition.publishedAt)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-stone-600 shadow-sm">
                  <p>Contributors: {edition.contributors.length === 0 ? "None" : edition.contributors.length}</p>
                  <p>Files: {edition.files.length}</p>
                  <p>External links: {edition.externalLinks.length}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <section>
                <h3 className="mb-3 text-base font-semibold text-stone-900">Operational files</h3>
                <div className="space-y-3 text-sm">
                  {edition.files.map((file) => (
                    <article key={file.id} className="rounded-2xl border border-stone-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-stone-900">{file.basename}</p>
                          <p className="text-stone-600">{file.relativePath}</p>
                        </div>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs uppercase tracking-wide text-stone-600">
                          {formatEditionFileRole(file.role)}
                        </span>
                      </div>
                      <p className="mt-3 text-stone-600">
                        {formatMediaKind(file.mediaKind)}{file.extension ? ` · .${file.extension.replace(/^\./, "")}` : ""} · {formatBytes(file.sizeBytes)}
                      </p>
                      <p className="mt-1 text-stone-500">
                        Created: {formatDateTime(file.createdAt)} · Modified: {formatDateTime(file.modifiedAt)}
                      </p>
                    </article>
                  ))}
                  {edition.files.length === 0 ? (
                    <p className="text-stone-600">No file inventory recorded for this edition.</p>
                  ) : null}
                </div>

                <h3 className="mb-3 mt-6 text-base font-semibold text-stone-900">Edition contributors</h3>
                <div className="rounded-2xl border border-stone-200 p-4 text-sm text-stone-600">
                  {edition.contributors.length === 0 ? (
                    <p>No contributor rows recorded for this edition.</p>
                  ) : (
                    edition.contributors.map((contributor) => (
                      <p key={`${contributor.role}:${contributor.name}`}>
                        <span className="font-medium text-stone-900">{contributor.name}</span>
                        {" · "}
                        {formatContributorRole(contributor.role)}
                      </p>
                    ))
                  )}
                </div>
              </section>

              <section>
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-stone-900">External links</h3>
                  <p className="text-sm text-stone-600">Manage edition-level links from external providers.</p>
                </div>
                <div className="space-y-4">
                  {edition.externalLinks.map((externalLink) => (
                    <form
                      key={externalLink.id}
                      className="rounded-2xl border border-stone-200 p-4 text-sm"
                      onSubmit={createExternalLinkUpdateSubmitHandler({
                        linkId: externalLink.id,
                        router,
                        setPending: setPendingExternalLinkAction,
                        updateExternalLink,
                      })}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="font-medium text-stone-900">External link {externalLink.id}</p>
                        <p className="text-xs text-stone-500">Last synced: {formatDateTime(externalLink.lastSyncedAt)}</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span>Provider</span>
                          <input
                            className="rounded-xl border border-stone-300 px-3 py-2"
                            defaultValue={externalLink.provider}
                            disabled={pendingExternalLinkAction !== null}
                            name="provider"
                            type="text"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span>External ID</span>
                          <input
                            className="rounded-xl border border-stone-300 px-3 py-2"
                            defaultValue={externalLink.externalId}
                            disabled={pendingExternalLinkAction !== null}
                            name="externalId"
                            type="text"
                          />
                        </label>
                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span>Metadata (JSON)</span>
                          <textarea
                            className="rounded-xl border border-stone-300 px-3 py-2"
                            defaultValue={externalLink.metadata}
                            disabled={pendingExternalLinkAction !== null}
                            name="metadata"
                            rows={4}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span>Last synced at</span>
                          <input
                            className="rounded-xl border border-stone-300 px-3 py-2"
                            defaultValue={externalLink.lastSyncedAt?.slice(0, 16) ?? ""}
                            disabled={pendingExternalLinkAction !== null}
                            name="lastSyncedAt"
                            type="datetime-local"
                          />
                        </label>
                      </div>
                      <p className="mt-2 text-xs text-stone-600">
                        Current metadata: {formatMetadataDisplay(externalLink.metadata)}
                      </p>
                      <div className="mt-3 flex gap-3">
                        <button
                          className="rounded-full border border-stone-300 px-4 py-2"
                          disabled={pendingExternalLinkAction !== null}
                          type="submit"
                        >
                          Save link
                        </button>
                        <button
                          className="rounded-full border border-red-300 px-4 py-2 text-red-700"
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
                    <p className="text-sm text-stone-600">No external links for this edition.</p>
                  ) : null}

                  <form
                    className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm"
                    onSubmit={createExternalLinkCreateSubmitHandler({
                      createExternalLink,
                      editionId: edition.id,
                      router,
                      setPending: setPendingExternalLinkAction,
                    })}
                  >
                    <p className="mb-3 font-medium text-stone-900">Add external link</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span>Provider</span>
                        <input
                          className="rounded-xl border border-stone-300 px-3 py-2"
                          disabled={pendingExternalLinkAction !== null}
                          name="provider"
                          type="text"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span>External ID</span>
                        <input
                          className="rounded-xl border border-stone-300 px-3 py-2"
                          disabled={pendingExternalLinkAction !== null}
                          name="externalId"
                          type="text"
                        />
                      </label>
                      <label className="flex flex-col gap-1 md:col-span-2">
                        <span>Metadata (JSON)</span>
                        <textarea
                          className="rounded-xl border border-stone-300 px-3 py-2"
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
                          className="rounded-xl border border-stone-300 px-3 py-2"
                          disabled={pendingExternalLinkAction !== null}
                          name="lastSyncedAt"
                          type="datetime-local"
                        />
                      </label>
                    </div>
                    <button
                      className="mt-3 rounded-full border border-stone-300 px-4 py-2"
                      disabled={pendingExternalLinkAction !== null}
                      type="submit"
                    >
                      Add link
                    </button>
                  </form>
                </div>
              </section>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
