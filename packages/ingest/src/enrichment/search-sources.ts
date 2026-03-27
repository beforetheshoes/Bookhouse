import type { OLSearchResult, OLWork, OLEdition } from "./open-library";
import type { GBVolume } from "./google-books";
import type { HCBook } from "./hardcover";
import type { RateLimitResult } from "./rate-limiter";

export type EnrichmentProvider = "openlibrary" | "googlebooks" | "hardcover";

export interface EnrichmentWorkData {
  title: string;
  authors: string[];
  description: string | null;
  subjects: string[];
  coverUrl: string | null;
}

export interface EnrichmentEditionData {
  publisher: string | null;
  publishedDate: string | null;
  pageCount: number | null;
  isbn13: string | null;
  isbn10: string | null;
}

export interface OLRawData {
  search: OLSearchResult;
  work: OLWork | null;
  edition: OLEdition | null;
}

export type SourceRaw = OLRawData | GBVolume | HCBook;

export interface SourceResult {
  provider: EnrichmentProvider;
  externalId: string;
  work: EnrichmentWorkData;
  edition: EnrichmentEditionData;
  raw: SourceRaw;
}

export type SearchSourcesResult =
  | { status: "success"; results: SourceResult[] }
  | { status: "no-results" }
  | { status: "rate-limited"; retryAfterMs: number | undefined };

export interface SearchSourcesDeps {
  searchOL: (title: string, author: string | undefined) => Promise<OLSearchResult[] | null>;
  getOLWork: (olid: string) => Promise<OLWork | null>;
  getOLEdition: (isbn: string) => Promise<OLEdition | null>;
  searchGB: (title: string, author: string | undefined) => Promise<GBVolume[] | null>;
  searchHC: (title: string, author: string | undefined) => Promise<HCBook[] | null>;
  checkRateLimit: () => RateLimitResult;
}

function normalizeOL(search: OLSearchResult, work: OLWork | null, edition: OLEdition | null): SourceResult {
  const coverId = search.coverId ?? (work?.coverIds[0] ?? null);
  return {
    provider: "openlibrary",
    externalId: search.olid,
    work: {
      title: search.title,
      authors: search.authors,
      description: work?.description ?? null,
      subjects: work?.subjects ?? [],
      coverUrl: coverId !== null ? `https://covers.openlibrary.org/b/id/${String(coverId)}-L.jpg` : null,
    },
    edition: {
      publisher: edition?.publishers[0] ?? null,
      publishedDate: edition?.publishDate ?? (search.firstPublishYear !== null ? String(search.firstPublishYear) : null),
      pageCount: edition?.pageCount ?? null,
      isbn13: search.isbns.find((i) => i.length === 13) ?? null,
      isbn10: search.isbns.find((i) => i.length === 10) ?? null,
    },
    raw: { search, work, edition },
  };
}

function normalizeGB(vol: GBVolume): SourceResult {
  return {
    provider: "googlebooks",
    externalId: vol.googleBooksId,
    work: {
      title: vol.title,
      authors: vol.authors,
      description: vol.description,
      subjects: vol.categories,
      coverUrl: vol.thumbnailUrl,
    },
    edition: {
      publisher: vol.publisher,
      publishedDate: vol.publishedDate,
      pageCount: vol.pageCount,
      isbn13: vol.isbn13,
      isbn10: vol.isbn10,
    },
    raw: vol,
  };
}

function normalizeHC(book: HCBook): SourceResult {
  return {
    provider: "hardcover",
    externalId: book.hardcoverId,
    work: {
      title: book.title,
      authors: book.authors,
      description: book.description,
      subjects: book.categories,
      coverUrl: book.imageUrl,
    },
    edition: {
      publisher: book.publisher,
      publishedDate: book.publishedDate,
      pageCount: book.pageCount,
      isbn13: book.isbn13,
      isbn10: null,
    },
    raw: book,
  };
}

export async function searchAllSources(
  title: string,
  author: string | undefined,
  deps: SearchSourcesDeps,
): Promise<SearchSourcesResult> {
  const rateCheck = deps.checkRateLimit();
  if (!rateCheck.allowed) {
    return { status: "rate-limited", retryAfterMs: rateCheck.retryAfterMs };
  }

  const [olResult, gbResult, hcResult] = await Promise.allSettled([
    deps.searchOL(title, author),
    deps.searchGB(title, author),
    deps.searchHC(title, author),
  ]);

  const results: SourceResult[] = [];

  // Open Library: take first result, fetch work + edition details
  if (olResult.status === "fulfilled" && olResult.value && olResult.value.length > 0) {
    const bestMatch = olResult.value[0] as OLSearchResult;
    let olWork: OLWork | null = null;
    let olEdition: OLEdition | null = null;
    try {
      olWork = await deps.getOLWork(bestMatch.olid);
    } catch {
      // Proceed without work details
    }
    const isbn = bestMatch.isbns.find((i) => i.length === 13) ?? bestMatch.isbns.find((i) => i.length === 10);
    if (isbn) {
      try {
        olEdition = await deps.getOLEdition(isbn);
      } catch {
        // Proceed without edition details
      }
    }
    results.push(normalizeOL(bestMatch, olWork, olEdition));
  }

  // Google Books: take first result
  if (gbResult.status === "fulfilled" && gbResult.value && gbResult.value.length > 0) {
    results.push(normalizeGB(gbResult.value[0] as GBVolume));
  }

  // Hardcover: take first result
  if (hcResult.status === "fulfilled" && hcResult.value && hcResult.value.length > 0) {
    results.push(normalizeHC(hcResult.value[0] as HCBook));
  }

  if (results.length === 0) return { status: "no-results" };
  return { status: "success", results };
}
