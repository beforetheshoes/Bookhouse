import { readFile } from "node:fs/promises";
import { xmlParser, ensureArray, getTextContent, getIdentifierScheme, type ParsedEpubIdentifier, type XmlValue } from "./xml-helpers";

export interface ParsedOpfMetadataRaw {
  title?: string;
  authors: Array<{ name: string; fileAs?: string; role?: string }>;
  identifiers: ParsedEpubIdentifier[];
  description?: string;
  subjects: string[];
  publisher?: string;
  date?: string;
  language?: string;
  series?: { name: string; index?: number };
}

export async function parseOpfSidecar(absolutePath: string): Promise<ParsedOpfMetadataRaw> {
  const xml = await readFile(absolutePath, "utf8");
  return parseOpfXml(xml);
}

export function parseOpfXml(opfXml: string): ParsedOpfMetadataRaw {
  const parsed = xmlParser.parse(opfXml) as {
    package?: { metadata?: Record<string, XmlValue> };
  };

  const metadata = parsed.package?.metadata;
  if (!metadata || typeof metadata !== "object") {
    throw new Error("OPF document did not contain metadata");
  }

  // Basic fields
  const title = getTextContent(metadata.title);

  // Authors with file-as and role
  const authors = ensureArray(metadata.creator)
    .map((author) => {
      const name = getTextContent(author);
      if (typeof name !== "string") return undefined;

      let fileAs: string | undefined;
      let role: string | undefined;

      if (typeof author === "object" && author !== null && !Array.isArray(author)) {
        if (typeof author["file-as"] === "string") fileAs = author["file-as"];
        if (typeof author.role === "string") role = author.role;
      }

      return { name, fileAs, role };
    })
    .filter((a): a is NonNullable<typeof a> => a !== undefined);

  // Identifiers
  const identifiers = ensureArray(metadata.identifier)
    .map((identifier) => {
      if (typeof identifier === "string") return { value: identifier };
      const value = getTextContent(identifier);
      if (typeof value === "string") {
        return {
          scheme: getIdentifierScheme(
            identifier as { id?: string; scheme?: string; "opf:scheme"?: string },
            metadata,
          ),
          value,
        };
      }
      return undefined;
    })
    .filter((id): id is ParsedEpubIdentifier => id !== undefined);

  // Extended OPF fields
  const description = getTextContent(metadata.description);
  const subjects = ensureArray(metadata.subject)
    .map((s) => getTextContent(s))
    .filter((s): s is string => typeof s === "string");
  const publisher = getTextContent(metadata.publisher);
  const date = getTextContent(metadata.date);
  const language = getTextContent(metadata.language);

  // Calibre series from <meta name="calibre:series" content="..."/>
  let seriesName: string | undefined;
  let seriesIndex: number | undefined;
  const metaEntries = ensureArray(metadata.meta);
  for (const entry of metaEntries) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      if (entry.name === "calibre:series" && typeof entry.content === "string") {
        seriesName = entry.content;
      }
      if (entry.name === "calibre:series_index" && typeof entry.content === "string") {
        const parsed = parseFloat(entry.content);
        if (!isNaN(parsed)) seriesIndex = parsed;
      }
    }
  }
  const series = seriesName ? { name: seriesName, index: seriesIndex } : undefined;

  return {
    title,
    authors,
    identifiers,
    description,
    subjects,
    publisher,
    date,
    language,
    series,
  };
}
