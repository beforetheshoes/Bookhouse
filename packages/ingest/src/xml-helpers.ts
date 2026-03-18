import { XMLParser } from "fast-xml-parser";

export interface ParsedEpubIdentifier {
  scheme?: string;
  value: string;
}

export const xmlParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

export function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function getTextContent(node: unknown): string | undefined {
  if (typeof node === "string") {
    return node;
  }

  if (node === null || typeof node !== "object") {
    return undefined;
  }

  const textNode = "text" in node && typeof node.text === "string" ? node.text : undefined;

  if (textNode !== undefined) {
    return textNode;
  }

  const hashTextNode = "#text" in node && typeof node["#text"] === "string" ? node["#text"] : undefined;

  return hashTextNode;
}

export function getIdentifierScheme(identifier: { id?: string; scheme?: string; "opf:scheme"?: string }, metadata: Record<string, unknown>): string | undefined {
  if (typeof identifier["opf:scheme"] === "string") {
    return identifier["opf:scheme"];
  }

  if (typeof identifier.scheme === "string") {
    return identifier.scheme;
  }

  if (typeof identifier.id !== "string") {
    return undefined;
  }

  const metaEntries = ensureArray(metadata.meta);

  for (const entry of metaEntries) {
    if (
      entry &&
      typeof entry === "object" &&
      "refines" in entry &&
      typeof entry.refines === "string" &&
      entry.refines === `#${identifier.id}` &&
      "property" in entry &&
      entry.property === "identifier-type"
    ) {
      return getTextContent(entry);
    }
  }

  return undefined;
}
