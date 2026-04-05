import type { EnrichmentProvider, SourceResult, SearchSourcesResult, SearchSourcesOptions } from "./search-sources";
import type { ApplyEnrichmentInput, ApplyEnrichmentResult, ApplyFieldValue } from "./apply-enrichment";

export interface BulkEnrichEditionData {
  id: string;
  formatFamily: "EBOOK" | "AUDIOBOOK";
  publisher: string | null;
  publishedDate: string | null;
  isbn13: string | null;
  isbn10: string | null;
  asin: string | null;
  language: string | null;
  pageCount: number | null;
  duration: number | null;
  narrators: string[];
  editedFields: string[];
  authors: string[];
}

export interface BulkEnrichWorkData {
  id: string;
  titleDisplay: string;
  description: string | null;
  coverPath: string | null;
  editedFields: string[];
  tags: string[];
  editions: BulkEnrichEditionData[];
}

export interface BulkEnrichDeps {
  loadWork: (workId: string) => Promise<BulkEnrichWorkData | null>;
  searchAllSources: (title: string, author: string | undefined, options?: SearchSourcesOptions) => Promise<SearchSourcesResult>;
  applyEnrichmentFields: (input: ApplyEnrichmentInput, deps: never) => Promise<ApplyEnrichmentResult>;
  applyCoverFromUrl: (workId: string, imageUrl: string, source: { provider: string; externalId: string }) => Promise<void>;
}

export type BulkEnrichResult =
  | { status: "enriched"; appliedFields: string[] }
  | { status: "not-found" }
  | { status: "no-editions" }
  | { status: "no-results" }
  | { status: "skipped-all" };

type BulkEnrichStrategy = "fullest" | "priority";

interface FieldDef {
  key: string;
  level: "work" | "edition";
}

const WORK_FIELDS: FieldDef[] = [
  { key: "title", level: "work" },
  { key: "authors", level: "work" },
  { key: "description", level: "work" },
  { key: "subjects", level: "work" },
];

const EDITION_FIELDS: FieldDef[] = [
  { key: "publisher", level: "edition" },
  { key: "publishedDate", level: "edition" },
  { key: "pageCount", level: "edition" },
  { key: "isbn13", level: "edition" },
  { key: "isbn10", level: "edition" },
];

const AUDIOBOOK_EDITION_FIELDS: FieldDef[] = [
  { key: "publisher", level: "edition" },
  { key: "publishedDate", level: "edition" },
  { key: "isbn13", level: "edition" },
  { key: "isbn10", level: "edition" },
  { key: "asin", level: "edition" },
  { key: "duration", level: "edition" },
  { key: "narrators", level: "edition" },
];

const SOURCE_WORK_FIELDS: Record<string, (w: SourceResult["work"]) => ApplyFieldValue> = {
  title: (w) => w.title,
  authors: (w) => w.authors,
  description: (w) => w.description,
  subjects: (w) => w.subjects,
};

const SOURCE_EDITION_FIELDS: Record<string, (e: SourceResult["edition"]) => ApplyFieldValue> = {
  publisher: (e) => e.publisher,
  publishedDate: (e) => e.publishedDate,
  pageCount: (e) => e.pageCount,
  isbn13: (e) => e.isbn13,
  isbn10: (e) => e.isbn10,
  asin: (e) => e.asin,
  duration: (e) => e.duration,
  narrators: (e) => e.narrators,
};

function getSourceFieldValue(result: SourceResult, field: FieldDef): ApplyFieldValue {
  if (field.level === "work") {
    return (SOURCE_WORK_FIELDS[field.key] as (w: SourceResult["work"]) => ApplyFieldValue)(result.work);
  }
  return (SOURCE_EDITION_FIELDS[field.key] as (e: SourceResult["edition"]) => ApplyFieldValue)(result.edition);
}

function getEditedFieldKey(fieldKey: string): string {
  if (fieldKey === "title") return "titleDisplay";
  return fieldKey;
}

function getCurrentWorkValue(work: BulkEnrichWorkData, authors: string[], key: string): ApplyFieldValue {
  if (key === "title") return work.titleDisplay;
  if (key === "authors") return authors;
  if (key === "description") return work.description;
  // subjects
  return work.tags;
}

const CURRENT_EDITION_FIELDS: Record<string, (e: BulkEnrichEditionData) => ApplyFieldValue> = {
  publisher: (e) => e.publisher,
  publishedDate: (e) => e.publishedDate,
  pageCount: (e) => e.pageCount,
  isbn13: (e) => e.isbn13,
  isbn10: (e) => e.isbn10,
  asin: (e) => e.asin,
  duration: (e) => e.duration,
  narrators: (e) => e.narrators,
};

function getCurrentEditionValue(edition: BulkEnrichEditionData, key: string): ApplyFieldValue {
  return (CURRENT_EDITION_FIELDS[key] as (e: BulkEnrichEditionData) => ApplyFieldValue)(edition);
}

function isFieldEmpty(value: ApplyFieldValue): boolean {
  if (value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

// Called only after isFieldEmpty check, so value is never null/empty.
function fieldContentScore(value: NonNullable<ApplyFieldValue>): number {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.length;
  return value.length;
}

interface MergedField {
  value: ApplyFieldValue;
  provider: EnrichmentProvider;
  externalId: string;
}

function pickFieldFullest(
  field: FieldDef,
  results: SourceResult[],
  currentValue: ApplyFieldValue,
  editedFieldKeys: string[],
): MergedField | null {
  if (editedFieldKeys.includes(getEditedFieldKey(field.key))) return null;
  if (!isFieldEmpty(currentValue)) return null;

  const firstResult = results[0] as SourceResult;
  let bestScore = 0;
  let bestValue: ApplyFieldValue = null;
  let bestProvider: EnrichmentProvider = firstResult.provider;
  let bestExternalId: string = firstResult.externalId;

  for (const result of results) {
    const value = getSourceFieldValue(result, field);
    if (isFieldEmpty(value)) continue;
    const score = fieldContentScore(value as NonNullable<ApplyFieldValue>);
    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
      bestProvider = result.provider;
      bestExternalId = result.externalId;
    }
  }

  if (isFieldEmpty(bestValue)) return null;
  return { value: bestValue, provider: bestProvider, externalId: bestExternalId };
}

function pickFieldPriority(
  field: FieldDef,
  results: SourceResult[],
  currentValue: ApplyFieldValue,
  editedFieldKeys: string[],
  sources: EnrichmentProvider[],
): MergedField | null {
  if (editedFieldKeys.includes(getEditedFieldKey(field.key))) return null;
  if (!isFieldEmpty(currentValue)) return null;

  const ordered = sources
    .map((s) => results.find((r) => r.provider === s))
    .filter((r): r is SourceResult => r !== undefined);

  for (const result of ordered) {
    const value = getSourceFieldValue(result, field);
    if (!isFieldEmpty(value)) {
      return { value, provider: result.provider, externalId: result.externalId };
    }
  }

  return null;
}

function mergeWorkFields(
  fields: FieldDef[],
  results: SourceResult[],
  work: BulkEnrichWorkData,
  authors: string[],
  strategy: BulkEnrichStrategy,
  sources: EnrichmentProvider[],
): Map<string, MergedField> {
  const merged = new Map<string, MergedField>();

  for (const field of fields) {
    const currentValue = getCurrentWorkValue(work, authors, field.key);
    const picked = strategy === "fullest"
      ? pickFieldFullest(field, results, currentValue, work.editedFields)
      : pickFieldPriority(field, results, currentValue, work.editedFields, sources);
    if (picked) merged.set(field.key, picked);
  }

  return merged;
}

function mergeEditionFields(
  fields: FieldDef[],
  results: SourceResult[],
  edition: BulkEnrichEditionData,
  strategy: BulkEnrichStrategy,
  sources: EnrichmentProvider[],
): Map<string, MergedField> {
  const merged = new Map<string, MergedField>();

  for (const field of fields) {
    const currentValue = getCurrentEditionValue(edition, field.key);
    const picked = strategy === "fullest"
      ? pickFieldFullest(field, results, currentValue, edition.editedFields)
      : pickFieldPriority(field, results, currentValue, edition.editedFields, sources);
    if (picked) merged.set(field.key, picked);
  }

  return merged;
}

function determineWinningSource(
  merged: Map<string, MergedField>,
  sources: EnrichmentProvider[],
  results: SourceResult[],
): { provider: EnrichmentProvider; externalId: string } {
  // Count fields won per provider
  const counts = new Map<string, number>();
  for (const field of merged.values()) {
    counts.set(field.provider, (counts.get(field.provider) ?? 0) + 1);
  }

  let bestProvider: EnrichmentProvider | null = null;
  let bestCount = 0;
  for (const source of sources) {
    const count = counts.get(source) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestProvider = source;
    }
  }

  if (bestProvider) {
    const result = results.find((r) => r.provider === bestProvider) as SourceResult;
    return { provider: result.provider, externalId: result.externalId };
  }

  // Fallback when merged map is empty (all fields already populated).
  // results is already filtered to sources, so first entry is valid.
  const fallback = results[0] as SourceResult;
  return { provider: fallback.provider, externalId: fallback.externalId };
}

function pickCoverUrl(
  results: SourceResult[],
  strategy: BulkEnrichStrategy,
  sources: EnrichmentProvider[],
): { coverUrl: string; source: { provider: string; externalId: string } } | null {
  if (strategy === "priority") {
    for (const s of sources) {
      const result = results.find((r) => r.provider === s);
      if (result?.work.coverUrl) {
        return { coverUrl: result.work.coverUrl, source: { provider: result.provider, externalId: result.externalId } };
      }
    }
    return null;
  }
  // Fullest: first available
  for (const result of results) {
    if (result.work.coverUrl) {
      return { coverUrl: result.work.coverUrl, source: { provider: result.provider, externalId: result.externalId } };
    }
  }
  return null;
}

export async function processBulkEnrichWork(
  workId: string,
  sources: EnrichmentProvider[],
  strategy: BulkEnrichStrategy,
  deps: BulkEnrichDeps,
): Promise<BulkEnrichResult> {
  const work = await deps.loadWork(workId);
  if (!work) return { status: "not-found" };
  if (work.editions.length === 0) return { status: "no-editions" };

  // Use first available author from any edition for search
  const allAuthors = work.editions.flatMap((e) => e.authors);
  const author = allAuthors.length > 0 ? allAuthors[0] : undefined;

  // Find ASIN from audiobook editions first, then any edition
  const asin = work.editions.find((e) => e.asin && e.formatFamily === "AUDIOBOOK")?.asin
    ?? work.editions.find((e) => e.asin)?.asin
    ?? undefined;

  const searchResult = await deps.searchAllSources(work.titleDisplay, author, asin ? { asin } : undefined);

  if (searchResult.status !== "success" || searchResult.results.length === 0) {
    return { status: "no-results" };
  }

  const filteredResults = searchResult.results.filter((r) => sources.includes(r.provider));
  if (filteredResults.length === 0) {
    return { status: "no-results" };
  }

  // Merge work-level fields (shared across all editions)
  const workMerged = mergeWorkFields(WORK_FIELDS, filteredResults, work, allAuthors, strategy, sources);

  const workFields: Record<string, ApplyFieldValue> = {};
  for (const field of WORK_FIELDS) {
    const m = workMerged.get(field.key);
    if (m) workFields[field.key] = m.value;
  }

  // Determine winning source from work-level fields for provenance
  const allMerged = new Map(workMerged);

  // Apply ebook edition fields (pageCount, ISBNs, publisher, etc.) to EBOOK editions only.
  const ebookEditions = work.editions.filter((e) => e.formatFamily === "EBOOK");
  const editionApplyPlan: Array<{ editionId: string; fields: Record<string, ApplyFieldValue> }> = [];

  for (const edition of ebookEditions) {
    const editionMerged = mergeEditionFields(EDITION_FIELDS, filteredResults, edition, strategy, sources);
    if (editionMerged.size === 0) continue;

    const fields: Record<string, ApplyFieldValue> = {};
    for (const field of EDITION_FIELDS) {
      const m = editionMerged.get(field.key);
      if (m) {
        fields[field.key] = m.value;
        allMerged.set(field.key, m);
      }
    }
    editionApplyPlan.push({ editionId: edition.id, fields });
  }

  // Apply audiobook edition fields (ASIN, duration, publisher, ISBNs, etc.) to AUDIOBOOK editions.
  // Only use audiobook-specific sources (Audible) — print-oriented sources (OL, GB, HC) return
  // print ISBNs, publishers, and dates that are incorrect for audiobook editions.
  const audiobookEditions = work.editions.filter((e) => e.formatFamily === "AUDIOBOOK");
  const audiobookResults = filteredResults.filter((r) => r.provider === "audible");

  for (const edition of audiobookEditions) {
    if (audiobookResults.length === 0) break;
    const editionMerged = mergeEditionFields(AUDIOBOOK_EDITION_FIELDS, audiobookResults, edition, strategy, sources);
    if (editionMerged.size === 0) continue;

    const fields: Record<string, ApplyFieldValue> = {};
    for (const field of AUDIOBOOK_EDITION_FIELDS) {
      const m = editionMerged.get(field.key);
      if (m) {
        fields[field.key] = m.value;
        allMerged.set(field.key, m);
      }
    }
    editionApplyPlan.push({ editionId: edition.id, fields });
  }

  // Cover — applies to the work, not edition-specific
  let coverApplied = false;
  if (!work.coverPath) {
    const coverPick = pickCoverUrl(filteredResults, strategy, sources);
    if (coverPick) {
      await deps.applyCoverFromUrl(workId, coverPick.coverUrl, coverPick.source);
      coverApplied = true;
    }
  }

  const winningSource = determineWinningSource(allMerged, sources, filteredResults);
  const allAppliedFields: string[] = [];

  // Apply work-level fields (once, shared across all editions)
  if (Object.keys(workFields).length > 0 || editionApplyPlan.length > 0) {
    // Apply work fields with the first ebook edition (or first audiobook) for author linking.
    // We know at least one edition exists (checked at the top of the function).
    const primaryEdition = ebookEditions[0] ?? (audiobookEditions[0] as BulkEnrichEditionData);
    const applyResult = await deps.applyEnrichmentFields(
      {
        workId,
        editionId: primaryEdition.id,
        workFields,
        editionFields: editionApplyPlan.find((p) => p.editionId === primaryEdition.id)?.fields ?? {},
        source: winningSource,
      },
      {} as never,
    );
    if (applyResult.appliedFields) allAppliedFields.push(...applyResult.appliedFields);

    // Apply edition fields to remaining ebook editions
    for (const plan of editionApplyPlan) {
      if (plan.editionId === primaryEdition.id) continue;
      const result = await deps.applyEnrichmentFields(
        {
          workId,
          editionId: plan.editionId,
          workFields: {},
          editionFields: plan.fields,
          source: winningSource,
        },
        {} as never,
      );
      if (result.appliedFields) allAppliedFields.push(...result.appliedFields);
    }
  }

  if (allAppliedFields.length === 0 && !coverApplied) {
    return { status: "skipped-all" };
  }

  return {
    status: "enriched",
    appliedFields: [...new Set(allAppliedFields)],
  };
}
