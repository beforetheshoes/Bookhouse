import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import type { FormatFamily, ProgressKind } from "@bookhouse/domain";
import { getCurrentUserServerFn } from "../lib/auth-client";
import { listLibraryWorksServerFn } from "../lib/library-server";
import type { LibraryWorkSummary } from "../lib/library-service";

const DEFAULT_SORT = "title-asc";
const DEFAULT_FILTER = "all";

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

function normalizeSort(value: string | null): "title-asc" | "title-desc" | "recent-progress" {
  if (value === "title-desc" || value === "recent-progress") {
    return value;
  }

  return DEFAULT_SORT;
}

function normalizeFilter(value: string | null): "all" | "with-progress" | "without-progress" {
  if (value === "with-progress" || value === "without-progress") {
    return value;
  }

  return DEFAULT_FILTER;
}

function formatFormatFamily(formatFamily: FormatFamily): string {
  return formatFamily.toLowerCase();
}

function formatProgressKind(progressKind: ProgressKind): string {
  return progressKind.toLowerCase();
}

function formatPercent(percent: number | null): string {
  return `${Math.round((percent ?? 0) * 100)}%`;
}

function formatProgressSummary(work: LibraryWorkSummary): string {
  if (work.latestProgress === null) {
    return "No progress yet";
  }

  return `${formatPercent(work.latestProgress.percent)} ${formatProgressKind(work.latestProgress.progressKind)}${work.latestProgress.source === null ? "" : ` via ${work.latestProgress.source}`}`;
}

export const Route = createFileRoute("/library")({
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

    const sort = normalizeSort(getSearchParam(location, "sort"));
    const filter = normalizeFilter(getSearchParam(location, "filter"));
    const works = await listLibraryWorksServerFn({
      data: {
        filter,
        sort,
      },
    });

    return { filter, sort, works };
  },
  component: LibraryRoute,
});

export function LibraryRoute() {
  const loaderData = Route.useLoaderData() as {
    filter?: unknown;
    sort?: unknown;
    works?: unknown;
  };
  const filter = typeof loaderData.filter === "string"
    ? normalizeFilter(loaderData.filter)
    : DEFAULT_FILTER;
  const sort = typeof loaderData.sort === "string"
    ? normalizeSort(loaderData.sort)
    : DEFAULT_SORT;
  const works = Array.isArray(loaderData.works) ? loaderData.works as LibraryWorkSummary[] : [];
  const hasActiveFilter = filter !== DEFAULT_FILTER;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="text-sm text-gray-600">Browse works in your library.</p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link to="/">Home</Link>
          <Link to="/collections">Collections</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>

      <section className="mb-6 flex flex-wrap gap-4 text-sm">
        <div className="flex gap-2">
          <span className="text-gray-600">Sort:</span>
          <a href={`/library?sort=title-asc&filter=${filter}`}>Title A-Z</a>
          <a href={`/library?sort=title-desc&filter=${filter}`}>Title Z-A</a>
          <a href={`/library?sort=recent-progress&filter=${filter}`}>Recent progress</a>
        </div>
        <div className="flex gap-2">
          <span className="text-gray-600">Filter:</span>
          <a href={`/library?sort=${sort}&filter=all`}>All</a>
          <a href={`/library?sort=${sort}&filter=with-progress`}>With progress</a>
          <a href={`/library?sort=${sort}&filter=without-progress`}>Without progress</a>
        </div>
      </section>

      <section className="space-y-4">
        {works.map((work) => (
          <article key={work.workId} className="rounded border border-gray-200 p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{work.titleDisplay}</p>
                <p className="text-sm text-gray-600">
                  {work.authors.length === 0 ? "Unknown author" : work.authors.join(", ")}
                </p>
              </div>
              <Link className="text-sm underline" to="/works/$workId" params={{ workId: work.workId }}>
                Open work
              </Link>
            </div>

            <div className="space-y-2 text-sm text-gray-700">
              <p>
                Formats: {work.formatFamilies.length === 0
                  ? "None"
                  : work.formatFamilies.map(formatFormatFamily).join(", ")}
                {" · "}
                {work.editionCount} edition{work.editionCount === 1 ? "" : "s"}
              </p>
              <p>Shelves: {work.shelves.length === 0 ? "No shelves" : work.shelves.join(", ")}</p>
              <p>Progress: {formatProgressSummary(work)}</p>
            </div>
          </article>
        ))}

        {works.length === 0 ? (
          <p className="text-sm text-gray-600">
            {hasActiveFilter ? "No works match the current filters." : "No works in your library yet."}
          </p>
        ) : null}
      </section>
    </main>
  );
}
