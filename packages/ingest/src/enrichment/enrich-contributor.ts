import type { OLAuthorSearchResult } from "./open-library";
import type { HCAuthor } from "./hardcover";
import type { WDAuthor } from "./wikidata";

interface ContributorRecord {
  id: string;
  nameDisplay: string;
  imagePath: string | null;
}

export interface EnrichContributorDeps {
  findContributor: (id: string) => Promise<ContributorRecord | null>;
  acquireOLToken: () => Promise<void>;
  searchOLAuthors: (name: string) => Promise<OLAuthorSearchResult[] | null>;
  applyPhoto: (contributorId: string, imageUrl: string) => Promise<{ success: boolean }>;
  acquireHCToken?: () => Promise<void>;
  searchHCAuthors?: (name: string) => Promise<HCAuthor[] | null>;
  acquireWDToken?: () => Promise<void>;
  searchWDAuthors?: (name: string) => Promise<WDAuthor[]>;
}

export type EnrichContributorResult =
  | { status: "enriched"; authorOlid: string }
  | { status: "not-found" }
  | { status: "no-results"; triedSources: string[] }
  | { status: "already-has-image" }
  | { status: "no-photo"; triedSources: string[] };

const NO_PHOTO_PATTERNS = [
  "too small",
  "Invalid image type",
  "not a valid image",
];

function isNoPhotoError(error: Error): boolean {
  return NO_PHOTO_PATTERNS.some((pattern) => error.message.includes(pattern));
}

async function tryApplyPhoto(
  deps: EnrichContributorDeps,
  contributorId: string,
  imageUrl: string,
): Promise<"success" | "no-photo" | "error"> {
  try {
    await deps.applyPhoto(contributorId, imageUrl);
    return "success";
  } catch (error) {
    if (error instanceof Error && isNoPhotoError(error)) {
      return "no-photo";
    }
    throw error;
  }
}

export async function enrichContributor(
  contributorId: string,
  deps: EnrichContributorDeps,
): Promise<EnrichContributorResult> {
  const contributor = await deps.findContributor(contributorId);
  if (!contributor) return { status: "not-found" };
  if (contributor.imagePath) return { status: "already-has-image" };

  const triedSources: string[] = [];
  let anyMatch = false;

  // Try Wikidata first (best author photo coverage)
  if (deps.searchWDAuthors && deps.acquireWDToken) {
    try {
      await deps.acquireWDToken();
      const wdResults = await deps.searchWDAuthors(contributor.nameDisplay);
      triedSources.push("wikidata");
      const wdMatch = wdResults.find((r) => r.imageUrl !== null);
      if (wdMatch?.imageUrl) {
        anyMatch = true;
        const wdResult = await tryApplyPhoto(deps, contributorId, wdMatch.imageUrl);
        if (wdResult === "success") {
          return { status: "enriched", authorOlid: `wd:${wdMatch.qid}` };
        }
      }
    } catch {
      triedSources.push("wikidata");
    }
  }

  // Fall back to Open Library
  await deps.acquireOLToken();
  const searchResults = await deps.searchOLAuthors(contributor.nameDisplay);
  const bestMatch = searchResults?.[0];
  triedSources.push("openlibrary");

  if (bestMatch) {
    anyMatch = true;
    const photoUrl = `https://covers.openlibrary.org/a/olid/${bestMatch.olid}-M.jpg`;
    await deps.acquireOLToken();
    const olResult = await tryApplyPhoto(deps, contributorId, photoUrl);
    if (olResult === "success") {
      return { status: "enriched", authorOlid: bestMatch.olid };
    }
  }

  // Fall back to Hardcover if configured
  if (deps.searchHCAuthors && deps.acquireHCToken) {
    try {
      await deps.acquireHCToken();
      const hcResults = await deps.searchHCAuthors(contributor.nameDisplay);
      const hcMatch = hcResults?.[0];
      triedSources.push("hardcover");
      if (hcMatch?.imageUrl) {
        anyMatch = true;
        const hcResult = await tryApplyPhoto(deps, contributorId, hcMatch.imageUrl);
        if (hcResult === "success") {
          return { status: "enriched", authorOlid: `hc:${hcMatch.hardcoverId}` };
        }
      } else if (hcMatch) {
        anyMatch = true;
      }
    } catch {
      triedSources.push("hardcover");
    }
  }

  return anyMatch ? { status: "no-photo", triedSources } : { status: "no-results", triedSources };
}
