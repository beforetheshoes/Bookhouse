const AUDIBLE_BASE = "https://api.audible.com/1.0/catalog/products";

export interface AudibleProduct {
  asin: string;
  title: string;
  authors: string[];
  narrators: string[];
  publisher: string | null;
  publishedDate: string | null;
  durationSeconds: number | null;
  language: string | null;
  description: string | null;
  coverUrl: string | null;
}

interface AudibleRawAuthor {
  asin?: string;
  name?: string;
}

interface AudibleRawNarrator {
  name?: string;
}

interface AudibleRawProduct {
  asin: string;
  title?: string;
  authors?: AudibleRawAuthor[];
  narrators?: AudibleRawNarrator[];
  publisher_name?: string;
  release_date?: string;
  runtime_length_min?: number;
  language?: string;
  merchandising_summary?: string;
  product_images?: Record<string, string>;
}

interface AudibleRawResponse {
  products?: AudibleRawProduct[];
  total_results?: number;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function pickLargestImage(images: Record<string, string> | undefined): string | null {
  if (!images) return null;
  const entries = Object.entries(images);
  if (entries.length === 0) return null;
  entries.sort(([a], [b]) => Number(b) - Number(a));
  return (entries[0] as [string, string])[1];
}

function parseProduct(raw: AudibleRawProduct): AudibleProduct {
  return {
    asin: raw.asin,
    title: raw.title ?? "",
    authors: raw.authors?.map((a) => a.name ?? "").filter((n) => n !== "") ?? [],
    narrators: raw.narrators?.map((n) => n.name ?? "").filter((n) => n !== "") ?? [],
    publisher: raw.publisher_name ?? null,
    publishedDate: raw.release_date ?? null,
    durationSeconds: raw.runtime_length_min != null ? raw.runtime_length_min * 60 : null,
    language: raw.language ?? null,
    description: raw.merchandising_summary ? stripHtml(raw.merchandising_summary) : null,
    coverUrl: pickLargestImage(raw.product_images),
  };
}

export async function searchAudible(
  title: string,
  author: string | undefined,
  fetcher: typeof fetch,
): Promise<AudibleProduct[] | null> {
  const params = new URLSearchParams({
    title,
    num_results: "5",
    products_sort_by: "Relevance",
    response_groups: "product_attrs,contributors,product_desc,media",
  });
  if (author) params.set("author", author);

  const response = await fetcher(`${AUDIBLE_BASE}?${params.toString()}`);

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Audible API error: ${String(response.status)}`);

  const data = (await response.json()) as AudibleRawResponse;
  const products = data.products ?? [];

  return products.map(parseProduct);
}
