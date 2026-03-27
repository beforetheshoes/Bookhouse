const GB_BASE = "https://www.googleapis.com/books/v1";

export interface GBVolume {
  googleBooksId: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  description: string | null;
  pageCount: number | null;
  categories: string[];
  isbn13: string | null;
  isbn10: string | null;
  thumbnailUrl: string | null;
}

interface IndustryIdentifier {
  type: string;
  identifier: string;
}

function extractIsbn(identifiers: IndustryIdentifier[] | undefined, type: string): string | null {
  if (!identifiers) return null;
  const match = identifiers.find((id) => id.type === type);
  return match?.identifier ?? null;
}

async function checkedJson(response: Response): Promise<unknown> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Google Books API error: ${String(response.status)}`);
  return response.json();
}

function parseVolume(item: Record<string, unknown>): GBVolume {
  const info = (item.volumeInfo ?? {}) as Record<string, unknown>;
  const identifiers = info.industryIdentifiers as IndustryIdentifier[] | undefined;
  const imageLinks = info.imageLinks as { thumbnail?: string } | undefined;

  return {
    googleBooksId: item.id as string,
    title: (info.title as string | undefined) ?? "",
    subtitle: (info.subtitle as string | undefined) ?? null,
    authors: (info.authors as string[] | undefined) ?? [],
    publisher: (info.publisher as string | undefined) ?? null,
    publishedDate: (info.publishedDate as string | undefined) ?? null,
    description: (info.description as string | undefined) ?? null,
    pageCount: (info.pageCount as number | undefined) ?? null,
    categories: (info.categories as string[] | undefined) ?? [],
    isbn13: extractIsbn(identifiers, "ISBN_13"),
    isbn10: extractIsbn(identifiers, "ISBN_10"),
    thumbnailUrl: imageLinks?.thumbnail ?? null,
  };
}

export async function searchGoogleBooks(
  title: string,
  author: string | undefined,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<GBVolume[] | null> {
  let q = `intitle:${title}`;
  if (author) q += `+inauthor:${author}`;

  const params = new URLSearchParams({ q, key: apiKey, maxResults: "5" });
  const response = await fetcher(`${GB_BASE}/volumes?${params.toString()}`);
  const data = await checkedJson(response);
  if (data === null) return null;

  const body = data as { totalItems?: number; items?: Array<Record<string, unknown>> };
  if (!body.items || body.totalItems === 0) return [];

  return body.items.map(parseVolume);
}

export async function getGoogleBooksVolume(
  volumeId: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<GBVolume | null> {
  const params = new URLSearchParams({ key: apiKey });
  const response = await fetcher(`${GB_BASE}/volumes/${volumeId}?${params.toString()}`);
  const data = await checkedJson(response);
  if (data === null) return null;

  return parseVolume(data as Record<string, unknown>);
}
