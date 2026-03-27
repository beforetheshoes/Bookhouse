const HC_BASE = "https://api.hardcover.app/v1/graphql";

export interface HCBook {
  hardcoverId: string;
  title: string;
  description: string | null;
  authors: string[];
  imageUrl: string | null;
  categories: string[];
  publisher: string | null;
  publishedDate: string | null;
  pageCount: number | null;
  isbn13: string | null;
}

// The search endpoint returns a raw JSON blob in `results`.
// Each result has these fields based on the Hardcover search index.
interface HCSearchHit {
  id?: number;
  title?: string;
  description?: string | null;
  image?: { url?: string } | null;
  author_names?: string[];
  cached_tags?: Array<{ tag: string }> | null;
  cached_image?: { url?: string } | null;
}

interface HCDetailBook {
  id: number;
  title: string;
  description?: string | null;
  image?: { url?: string } | null;
  contributions?: Array<{ author: { name: string } }>;
  taggings?: Array<{ tag: { tag: string } }>;
  editions?: Array<{
    isbn_13?: string | null;
    publishers?: Array<{ publisher: { name: string } }>;
    release_date?: string | null;
    pages?: number | null;
  }>;
}

const SEARCH_QUERY = `
  query SearchBooks($query: String!) {
    search(query: $query, query_type: "Book", per_page: 5, page: 1) {
      results
    }
  }
`;

const GET_BOOK_QUERY = `
  query GetBook($id: Int!) {
    books(where: { id: { _eq: $id } }, limit: 1) {
      id
      title
      description
      image { url }
      contributions { author { name } }
      taggings { tag { tag } }
      editions(per_page: 1) {
        isbn_13
        publishers { publisher { name } }
        release_date
        pages
      }
    }
  }
`;

function normalizeToken(apiKey: string): string {
  const stripped = apiKey.replace(/^Bearer\s+/i, "");
  return `Bearer ${stripped}`;
}

function parseSearchHit(hit: HCSearchHit): HCBook {
  return {
    hardcoverId: String(hit.id ?? 0),
    title: hit.title ?? "",
    description: hit.description ?? null,
    authors: hit.author_names ?? [],
    imageUrl: hit.cached_image?.url ?? hit.image?.url ?? null,
    categories: hit.cached_tags?.map((t) => t.tag) ?? [],
    publisher: null,
    publishedDate: null,
    pageCount: null,
    isbn13: null,
  };
}

function parseDetailBook(raw: HCDetailBook): HCBook {
  const firstEdition = raw.editions?.[0];

  return {
    hardcoverId: String(raw.id),
    title: raw.title,
    description: raw.description ?? null,
    authors: raw.contributions?.map((c) => c.author.name) ?? [],
    imageUrl: raw.image?.url ?? null,
    categories: raw.taggings?.map((t) => t.tag.tag) ?? [],
    publisher: firstEdition?.publishers?.[0]?.publisher.name ?? null,
    publishedDate: firstEdition?.release_date ?? null,
    pageCount: firstEdition?.pages ?? null,
    isbn13: firstEdition?.isbn_13 ?? null,
  };
}

async function graphqlRequest(
  query: string,
  variables: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const response = await fetcher(HC_BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: normalizeToken(apiKey),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Hardcover API error ${String(response.status)}: ${body.slice(0, 200)}`);
  }
  const json = (await response.json()) as { data?: unknown; errors?: Array<{ message?: string }> };
  if (json.errors && json.errors.length > 0) {
    const msg = json.errors[0]?.message ?? "Unknown GraphQL error";
    throw new Error(`Hardcover GraphQL error: ${msg}`);
  }
  return json.data ?? null;
}

function extractHits(data: unknown): HCSearchHit[] {
  if (Array.isArray(data)) return data as HCSearchHit[];

  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    // Typesense format: { hits: [{ document: {...} }], found: N }
    if (Array.isArray(obj.hits)) {
      const hits = obj.hits as Array<Record<string, unknown>>;
      return hits.map((h) => (h.document ?? h) as HCSearchHit);
    }
    // Direct array under another key
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) return val as HCSearchHit[];
    }
    throw new Error(`Hardcover results object has no array. Keys: ${Object.keys(obj).join(", ")}`);
  }

  throw new Error(`Hardcover results unexpected shape: ${typeof data}`);
}

export async function searchHardcover(
  title: string,
  author: string | undefined,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<HCBook[] | null> {
  const query = author ? `${title} ${author}` : title;
  const data = await graphqlRequest(SEARCH_QUERY, { query }, apiKey, fetcher);
  if (data === null) {
    throw new Error("Hardcover returned no data (check API key and query)");
  }

  const search = (data as { search?: { results?: unknown } }).search;
  if (!search) {
    throw new Error(`Hardcover response missing 'search' field. Got keys: ${Object.keys(data as Record<string, unknown>).join(", ")}`);
  }
  if (search.results === undefined || search.results === null) {
    throw new Error(`Hardcover search has no 'results'. Got keys: ${Object.keys(search as Record<string, unknown>).join(", ")}`);
  }

  // results can be: a JSON string, an array, or an object with a `hits` array (Typesense format)
  let results: HCSearchHit[];
  if (typeof search.results === "string") {
    const parsed: unknown = JSON.parse(search.results);
    results = extractHits(parsed);
  } else if (Array.isArray(search.results)) {
    results = search.results as HCSearchHit[];
  } else if (typeof search.results === "object") {
    results = extractHits(search.results);
  } else {
    throw new Error(`Hardcover results unexpected type: ${typeof search.results}`);
  }

  if (results.length === 0) return [];
  return results.map(parseSearchHit);
}

export async function getHardcoverBook(
  bookId: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<HCBook | null> {
  const data = await graphqlRequest(GET_BOOK_QUERY, { id: Number(bookId) }, apiKey, fetcher);
  if (data === null) return null;

  const books = (data as { books?: HCDetailBook[] }).books;
  if (!books?.[0]) return null;

  return parseDetailBook(books[0]);
}
