import type { ParsedEpubIdentifier, ParsedEpubMetadataRaw } from "./epub";

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

export const METADATA_INTERNALS = {
  classifyIdentifier,
  isAsin,
  isIsbn10,
  isIsbn13,
  normalizeIdentifierValue,
  normalizeScheme,
  normalizeWhitespace,
};
