const OL_BASE = "https://openlibrary.org";

export interface OLSearchResult {
  olid: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  isbns: string[];
  coverId: number | null;
}

export interface OLEdition {
  olid: string;
  title: string;
  publishers: string[];
  publishDate: string | null;
  pageCount: number | null;
  coverIds: number[];
  workOlid: string;
}

export interface OLWork {
  olid: string;
  title: string;
  description: string | null;
  coverIds: number[];
  subjects: string[];
}

interface OLRawSearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
}

interface OLRawSearchResponse {
  docs: OLRawSearchDoc[];
}

interface OLRawEdition {
  key: string;
  title: string;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  covers?: number[];
  works?: Array<{ key: string }>;
}

interface OLRawWork {
  key: string;
  title: string;
  description?: string | { value: string };
  covers?: number[];
  subjects?: string[];
}

function extractOlid(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] as string;
}

async function checkedJson<T>(response: Response): Promise<T | null> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Library API error: ${String(response.status)}`);
  return response.json() as Promise<T>;
}

export async function searchOpenLibrary(
  title: string,
  author: string | undefined,
  fetcher: typeof fetch,
): Promise<OLSearchResult[] | null> {
  const params = new URLSearchParams({ title });
  if (author) params.set("author", author);
  params.set("limit", "5");

  const response = await fetcher(`${OL_BASE}/search.json?${params.toString()}`);
  const data = await checkedJson<OLRawSearchResponse>(response);
  if (data === null) return null;

  return data.docs.map((doc) => ({
    olid: extractOlid(doc.key),
    title: doc.title,
    authors: doc.author_name ?? [],
    firstPublishYear: doc.first_publish_year ?? null,
    isbns: doc.isbn ?? [],
    coverId: doc.cover_i ?? null,
  }));
}

export async function getOpenLibraryEdition(
  isbn: string,
  fetcher: typeof fetch,
): Promise<OLEdition | null> {
  const response = await fetcher(`${OL_BASE}/isbn/${isbn}.json`);
  const data = await checkedJson<OLRawEdition>(response);
  if (data === null) return null;

  const works = data.works;
  return {
    olid: extractOlid(data.key),
    title: data.title,
    publishers: data.publishers ?? [],
    publishDate: data.publish_date ?? null,
    pageCount: data.number_of_pages ?? null,
    coverIds: data.covers ?? [],
    workOlid: works && works[0] ? extractOlid(works[0].key) : "",
  };
}

export async function getOpenLibraryWork(
  olid: string,
  fetcher: typeof fetch,
): Promise<OLWork | null> {
  const response = await fetcher(`${OL_BASE}/works/${olid}.json`);
  const data = await checkedJson<OLRawWork>(response);
  if (data === null) return null;

  let description: string | null = null;
  if (typeof data.description === "string") {
    description = data.description;
  } else if (data.description && typeof data.description === "object") {
    description = data.description.value;
  }

  return {
    olid: extractOlid(data.key),
    title: data.title,
    description,
    coverIds: data.covers ?? [],
    subjects: data.subjects ?? [],
  };
}
