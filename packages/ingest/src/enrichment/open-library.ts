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

function extractOlid(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] as string;
}

async function checkedJson(response: Response): Promise<unknown> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Library API error: ${String(response.status)}`);
  return response.json();
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
  const data = await checkedJson(response);
  if (data === null) return null;

  const body = data as { docs: Array<Record<string, unknown>> };
  return body.docs.map((doc) => ({
    olid: extractOlid(doc.key as string),
    title: doc.title as string,
    authors: (doc.author_name as string[] | undefined) ?? [],
    firstPublishYear: (doc.first_publish_year as number | undefined) ?? null,
    isbns: (doc.isbn as string[] | undefined) ?? [],
    coverId: (doc.cover_i as number | undefined) ?? null,
  }));
}

export async function getOpenLibraryEdition(
  isbn: string,
  fetcher: typeof fetch,
): Promise<OLEdition | null> {
  const response = await fetcher(`${OL_BASE}/isbn/${isbn}.json`);
  const data = await checkedJson(response);
  if (data === null) return null;

  const body = data as Record<string, unknown>;
  const works = body.works as Array<{ key: string }> | undefined;
  return {
    olid: extractOlid(body.key as string),
    title: body.title as string,
    publishers: (body.publishers as string[] | undefined) ?? [],
    publishDate: (body.publish_date as string | undefined) ?? null,
    pageCount: (body.number_of_pages as number | undefined) ?? null,
    coverIds: (body.covers as number[] | undefined) ?? [],
    workOlid: works && works[0] ? extractOlid(works[0].key) : "",
  };
}

export async function getOpenLibraryWork(
  olid: string,
  fetcher: typeof fetch,
): Promise<OLWork | null> {
  const response = await fetcher(`${OL_BASE}/works/${olid}.json`);
  const data = await checkedJson(response);
  if (data === null) return null;

  const body = data as Record<string, unknown>;
  let description: string | null = null;
  if (typeof body.description === "string") {
    description = body.description;
  } else if (body.description && typeof body.description === "object") {
    description = (body.description as { value: string }).value;
  }

  return {
    olid: extractOlid(body.key as string),
    title: body.title as string,
    description,
    coverIds: (body.covers as number[] | undefined) ?? [],
    subjects: (body.subjects as string[] | undefined) ?? [],
  };
}
