import { createHash } from "node:crypto";

const WD_API = "https://www.wikidata.org/w/api.php";

export interface WDAuthor {
  qid: string;
  name: string;
  imageUrl: string | null;
}

interface WDSearchResult {
  id: string;
  display?: { label?: { value?: string } };
}

interface WDSearchResponse {
  search: WDSearchResult[];
}

interface WDClaimsResponse {
  claims?: {
    P18?: Array<{ mainsnak: { datavalue: { value: string } } }>;
  };
}

export function buildWikimediaThumbUrl(filename: string): string {
  const normalized = filename.replace(/ /g, "_");
  const md5 = createHash("md5").update(normalized).digest("hex");
  const encoded = encodeURIComponent(normalized);
  const a = md5.charAt(0);
  const ab = md5.slice(0, 2);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${encoded}/200px-${encoded}`;
}

async function getImageUrl(qid: string, fetcher: typeof fetch): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: "wbgetclaims",
      entity: qid,
      property: "P18",
      format: "json",
    });
    const response = await fetcher(`${WD_API}?${params.toString()}`);
    if (!response.ok) return null;
    const data = (await response.json()) as WDClaimsResponse;
    const filename = data.claims?.P18?.[0]?.mainsnak.datavalue.value;
    if (!filename) return null;
    return buildWikimediaThumbUrl(filename);
  } catch {
    return null;
  }
}

export async function searchWikidataAuthors(
  name: string,
  fetcher: typeof fetch,
): Promise<WDAuthor[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: name,
    language: "en",
    type: "item",
    limit: "3",
    format: "json",
  });

  const response = await fetcher(`${WD_API}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Wikidata API error: ${String(response.status)}`);
  }

  const data = (await response.json()) as WDSearchResponse;
  if (data.search.length === 0) return [];

  const results: WDAuthor[] = [];
  for (const hit of data.search) {
    const imageUrl = await getImageUrl(hit.id, fetcher);
    results.push({
      qid: hit.id,
      name: hit.display?.label?.value ?? "",
      imageUrl,
    });
  }

  return results;
}
