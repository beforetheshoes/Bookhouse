import type { ParsedAudiobookMetadataJsonRaw, ParsedAudioId3TagsRaw } from "./audiobook";
import type { ParsedEpubIdentifier, ParsedEpubMetadataRaw } from "./epub";
import type { ParsedOpfMetadataRaw } from "./opf";

export interface NormalizedBookIdentifiers {
  asin?: string;
  isbn10?: string;
  isbn13?: string;
  unknown: string[];
}

export interface NormalizedBookMetadata {
  authors: string[];
  identifiers: NormalizedBookIdentifiers;
  title?: string;
  narrators?: string[];
  description?: string;
  subjects?: string[];
  publisher?: string;
  date?: string;
  language?: string;
  series?: { name: string; index?: number };
}

function canonicalizeForMatching(value: string | undefined): string | undefined {
  const normalized = normalizeWhitespace(value);

  if (normalized === undefined) {
    return undefined;
  }

  const canonical = normalized
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return canonical.length > 0 ? canonical : undefined;
}

function normalizeWhitespace(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeIdentifierValue(value: string): string {
  return value.replace(/[\s-]+/g, "").trim();
}

function normalizeScheme(value: string | undefined): string | undefined {
  const normalized = normalizeWhitespace(value);
  return normalized?.toLowerCase();
}

function isIsbn10(value: string): boolean {
  return /^(?:\d{9}[\dX])$/.test(value);
}

function isIsbn13(value: string): boolean {
  return /^\d{13}$/.test(value);
}

function isAsin(value: string): boolean {
  return /^[A-Z0-9]{10}$/.test(value);
}

function classifyIdentifier(identifier: ParsedEpubIdentifier): {
  kind: "asin" | "isbn10" | "isbn13" | "unknown";
  value: string;
} {
  const normalizedValue = normalizeIdentifierValue(identifier.value);
  const upperValue = normalizedValue.toUpperCase();
  const scheme = normalizeScheme(identifier.scheme);

  if (scheme?.includes("isbn")) {
    if (isIsbn13(upperValue)) {
      return { kind: "isbn13", value: upperValue };
    }

    if (isIsbn10(upperValue)) {
      return { kind: "isbn10", value: upperValue };
    }
  }

  if (scheme === "asin" && isAsin(upperValue)) {
    return { kind: "asin", value: upperValue };
  }

  if (isIsbn13(upperValue)) {
    return { kind: "isbn13", value: upperValue };
  }

  if (isIsbn10(upperValue)) {
    return { kind: "isbn10", value: upperValue };
  }

  if (isAsin(upperValue)) {
    return { kind: "asin", value: upperValue };
  }

  return {
    kind: "unknown",
    value: normalizeWhitespace(identifier.value) ?? identifier.value.trim(),
  };
}

export function createIdentifierMap(identifiers: ParsedEpubIdentifier[]): NormalizedBookIdentifiers {
  const normalized: NormalizedBookIdentifiers = {
    unknown: [],
  };
  const seenUnknown = new Set<string>();

  for (const identifier of identifiers) {
    const classification = classifyIdentifier(identifier);

    if (classification.kind === "unknown") {
      if (classification.value.length > 0 && !seenUnknown.has(classification.value)) {
        normalized.unknown.push(classification.value);
        seenUnknown.add(classification.value);
      }
      continue;
    }

    normalized[classification.kind] ??= classification.value;
  }

  return normalized;
}

export function normalizeBookMetadata(raw: ParsedEpubMetadataRaw): NormalizedBookMetadata {
  const authors = [...new Set(raw.authors
    .map((author) => normalizeWhitespace(author))
    .filter((author): author is string => author !== undefined))];

  return {
    authors,
    identifiers: createIdentifierMap(raw.identifiers),
    title: normalizeWhitespace(raw.title),
  };
}

export function canonicalizeBookTitle(value: string | undefined): string | undefined {
  return canonicalizeForMatching(value);
}

export function canonicalizeContributorName(value: string | undefined): string | undefined {
  return canonicalizeForMatching(value);
}

export function canonicalizeContributorNames(values: string[]): string[] {
  return [...new Set(
    values
      .map((value) => canonicalizeContributorName(value))
      .filter((value): value is string => value !== undefined),
  )].sort();
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function normalizeOpfMetadata(raw: ParsedOpfMetadataRaw): NormalizedBookMetadata {
  const authors = [...new Set(
    raw.authors
      .map((a) => normalizeWhitespace(a.name))
      .filter((a): a is string => a !== undefined)
  )];

  const description = raw.description ? normalizeWhitespace(stripHtmlTags(raw.description)) : undefined;
  const subjects = raw.subjects
    .map((s) => normalizeWhitespace(s))
    .filter((s): s is string => s !== undefined);

  return {
    authors,
    identifiers: createIdentifierMap(raw.identifiers),
    title: normalizeWhitespace(raw.title),
    description,
    subjects: subjects.length > 0 ? subjects : undefined,
    publisher: normalizeWhitespace(raw.publisher),
    date: normalizeWhitespace(raw.date),
    language: normalizeWhitespace(raw.language),
    series: raw.series ? { name: raw.series.name, index: raw.series.index } : undefined,
  };
}

export function normalizeAudiobookMetadata(
  json: ParsedAudiobookMetadataJsonRaw,
  id3?: ParsedAudioId3TagsRaw,
): NormalizedBookMetadata {
  const title = normalizeWhitespace(json.title);

  // Authors: json.authors, fallback to ID3 albumArtist or artist
  let authors = [...new Set(
    json.authors
      .map((a) => normalizeWhitespace(a))
      .filter((a): a is string => a !== undefined),
  )];
  if (authors.length === 0 && id3) {
    const fallbackAuthor = normalizeWhitespace(id3.albumArtist ?? id3.artist);
    if (fallbackAuthor !== undefined) {
      authors = [fallbackAuthor];
    }
  }

  // Narrators
  const narrators = [...new Set(
    json.narrators
      .map((n) => normalizeWhitespace(n))
      .filter((n): n is string => n !== undefined),
  )];

  // Identifiers from isbn/asin fields
  const identifierInputs: ParsedEpubIdentifier[] = [];
  if (json.isbn !== undefined) {
    identifierInputs.push({ scheme: "ISBN", value: json.isbn });
  }
  if (json.asin !== undefined) {
    identifierInputs.push({ scheme: "ASIN", value: json.asin });
  }
  const identifiers = createIdentifierMap(identifierInputs);

  // Description
  const description = normalizeWhitespace(json.description);

  // Subjects from genres, fallback to ID3
  let subjects = json.genres
    .map((g) => normalizeWhitespace(g))
    .filter((g): g is string => g !== undefined);
  if (subjects.length === 0 && id3?.genres && id3.genres.length > 0) {
    subjects = id3.genres
      .map((g) => normalizeWhitespace(g))
      .filter((g): g is string => g !== undefined);
  }

  // Publisher
  const publisher = normalizeWhitespace(json.publisher);

  // Date from publishedYear, fallback to ID3 year
  let date: string | undefined = normalizeWhitespace(json.publishedYear);
  if (date === undefined && id3?.year !== undefined) {
    date = String(id3.year);
  }

  // Language
  const language = normalizeWhitespace(json.language);

  // Series from first entry
  let series: { name: string; index?: number } | undefined;
  const firstSeries = json.series[0];
  if (firstSeries) {
    const index = parseFloat(firstSeries.sequence);
    series = { name: firstSeries.name, index: isNaN(index) ? undefined : index };
  }

  return {
    authors,
    identifiers,
    title,
    narrators,
    description,
    subjects: subjects.length > 0 ? subjects : undefined,
    publisher,
    date,
    language,
    series,
  };
}

export const METADATA_INTERNALS = {
  canonicalizeBookTitle,
  canonicalizeContributorName,
  canonicalizeContributorNames,
  classifyIdentifier,
  isAsin,
  isIsbn10,
  isIsbn13,
  canonicalizeForMatching,
  normalizeIdentifierValue,
  normalizeScheme,
  normalizeWhitespace,
  stripHtmlTags,
};
