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

interface GBRawVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string[];
  industryIdentifiers?: IndustryIdentifier[];
  imageLinks?: { thumbnail?: string };
}

interface GBRawVolume {
  id: string;
  volumeInfo?: GBRawVolumeInfo;
}

interface GBRawSearchResponse {
  totalItems?: number;
  items?: GBRawVolume[];
}

function extractIsbn(identifiers: IndustryIdentifier[] | undefined, type: string): string | null {
  if (!identifiers) return null;
  const match = identifiers.find((id) => id.type === type);
  return match?.identifier ?? null;
}

async function checkedJson<T>(response: Response): Promise<T | null> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Google Books API error: ${String(response.status)}`);
  return response.json() as Promise<T>;
}

function parseVolume(item: GBRawVolume): GBVolume {
  const info = item.volumeInfo ?? {};
  const identifiers = info.industryIdentifiers;
  const imageLinks = info.imageLinks;

  return {
    googleBooksId: item.id,
    title: info.title ?? "",
    subtitle: info.subtitle ?? null,
    authors: info.authors ?? [],
    publisher: info.publisher ?? null,
    publishedDate: info.publishedDate ?? null,
    description: info.description ?? null,
    pageCount: info.pageCount ?? null,
    categories: info.categories ?? [],
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
  const data = await checkedJson<GBRawSearchResponse>(response);
  if (data === null) return null;

  if (!data.items || data.totalItems === 0) return [];

  return data.items.map(parseVolume);
}

export async function getGoogleBooksVolume(
  volumeId: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<GBVolume | null> {
  const params = new URLSearchParams({ key: apiKey });
  const response = await fetcher(`${GB_BASE}/volumes/${volumeId}?${params.toString()}`);
  const data = await checkedJson<GBRawVolume>(response);
  if (data === null) return null;

  return parseVolume(data);
}
