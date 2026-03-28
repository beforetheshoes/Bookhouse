import type { OLSearchResult, OLWork } from "./open-library";

interface WorkEdition {
  id: string;
  isbn13: string | null;
  isbn10: string | null;
  contributors: Array<{ contributor: { nameDisplay: string } }>;
  externalLinks: Array<{ provider: string; externalId: string }>;
}

interface WorkWithEditions {
  id: string;
  titleDisplay: string;
  editions: WorkEdition[];
}

export interface ExternalLinkMetadata {
  title: string;
  description: string | null;
  coverIds: number[];
  subjects: string[];
  firstPublishYear: number | null;
  coverId: number | null;
}

export interface EnrichWorkDeps {
  findWork: (workId: string) => Promise<WorkWithEditions | null>;
  searchOL: (title: string, author: string | undefined) => Promise<OLSearchResult[] | null>;
  getOLWork: (olid: string) => Promise<OLWork | null>;
  upsertExternalLink: (data: {
    editionId: string;
    provider: string;
    externalId: string;
    metadata: ExternalLinkMetadata;
  }) => Promise<void>;
  acquireOLToken: () => Promise<void>;
}

export type EnrichWorkResult =
  | { status: "enriched"; workOlid: string }
  | { status: "not-found" }
  | { status: "no-results" }
  | { status: "no-editions" }
  | { status: "already-enriched" };

export async function enrichWork(
  workId: string,
  deps: EnrichWorkDeps,
): Promise<EnrichWorkResult> {
  await deps.acquireOLToken();

  const work = await deps.findWork(workId);
  if (!work) return { status: "not-found" };

  const edition = work.editions[0];
  if (!edition) return { status: "no-editions" };
  const hasOLLink = edition.externalLinks.some((l) => l.provider === "openlibrary");
  if (hasOLLink) return { status: "already-enriched" };

  const author = edition.contributors.length > 0
    ? edition.contributors[0]?.contributor.nameDisplay
    : undefined;

  const searchResults = await deps.searchOL(work.titleDisplay, author);
  const [bestMatch] = searchResults ?? [];
  if (!bestMatch) return { status: "no-results" };
  const olWork = await deps.getOLWork(bestMatch.olid);

  await deps.upsertExternalLink({
    editionId: edition.id,
    provider: "openlibrary",
    externalId: bestMatch.olid,
    metadata: {
      title: bestMatch.title,
      description: olWork?.description ?? null,
      coverIds: olWork?.coverIds ?? [],
      subjects: olWork?.subjects ?? [],
      firstPublishYear: bestMatch.firstPublishYear,
      coverId: bestMatch.coverId,
    },
  });

  return { status: "enriched", workOlid: bestMatch.olid };
}
