import { createRequire } from "node:module";
import { xmlParser, ensureArray, getTextContent, getIdentifierScheme, type ParsedEpubIdentifier } from "./xml-helpers";

export type { ParsedEpubIdentifier } from "./xml-helpers";

export interface ParsedEpubMetadataRaw {
  authors: string[];
  identifiers: ParsedEpubIdentifier[];
  title?: string;
}

interface ZipEntry {
  filename: string;
  openReadStream(): Promise<NodeJS.ReadableStream>;
}

interface ZipArchive extends AsyncIterable<ZipEntry> {
  close(): Promise<void>;
}

const require = createRequire(import.meta.url);
const yauzl = require("yauzl-promise") as {
  open(path: string): Promise<ZipArchive>;
};

async function readZipEntryText(absolutePath: string, entryPath: string): Promise<string> {
  const zip = await yauzl.open(absolutePath);

  try {
    for await (const entry of zip) {
      if (entry.filename !== entryPath) {
        continue;
      }

      const stream = await entry.openReadStream();
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks).toString("utf8");
    }
  } finally {
    await zip.close();
  }

  throw new Error(`EPUB entry "${entryPath}" was not found`);
}

function normalizeZipPath(pathValue: string): string {
  return pathValue
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .reduce<string[]>((segments, segment) => {
      if (segment === "..") {
        segments.pop();
        return segments;
      }

      segments.push(segment);
      return segments;
    }, [])
    .join("/");
}

function resolveRelativeZipPath(basePath: string, relativePath: string): string {
  const baseSegments = normalizeZipPath(basePath).split("/").filter((segment) => segment.length > 0);
  baseSegments.pop();

  return normalizeZipPath([...baseSegments, relativePath].join("/"));
}

function getRootfilePath(containerXml: string): string {
  const parsed = xmlParser.parse(containerXml) as {
    container?: {
      rootfiles?: {
        rootfile?: { "full-path"?: string } | Array<{ "full-path"?: string }>;
      };
    };
  };

  const rootfiles = ensureArray(parsed.container?.rootfiles?.rootfile);
  const rootfilePath = rootfiles.find((candidate) => typeof candidate["full-path"] === "string")?.["full-path"];

  if (!rootfilePath) {
    throw new Error('EPUB container.xml did not declare a rootfile "full-path"');
  }

  return normalizeZipPath(rootfilePath);
}

function getPackageMetadata(opfXml: string): ParsedEpubMetadataRaw {
  const parsed = xmlParser.parse(opfXml) as {
    package?: {
      metadata?: Record<string, unknown>;
    };
  };

  const metadata = parsed.package?.metadata;

  if (!metadata || typeof metadata !== "object") {
    throw new Error("EPUB package document did not contain metadata");
  }

  const title = getTextContent(metadata.title);
  const authors = ensureArray(metadata.creator)
    .map((author) => getTextContent(author))
    .filter((author): author is string => typeof author === "string");
  const identifiers = ensureArray(metadata.identifier)
    .map((identifier) => {
      if (typeof identifier === "string") {
        return { value: identifier };
      }

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
    .filter((identifier): identifier is ParsedEpubIdentifier => identifier !== undefined);

  return {
    authors,
    identifiers,
    title,
  };
}

export async function parseEpubMetadata(absolutePath: string): Promise<ParsedEpubMetadataRaw> {
  const containerXml = await readZipEntryText(absolutePath, "META-INF/container.xml");
  const rootfilePath = getRootfilePath(containerXml);
  const opfXml = await readZipEntryText(absolutePath, rootfilePath);

  return getPackageMetadata(opfXml);
}

export const EPUB_INTERNALS = {
  getPackageMetadata,
  getIdentifierScheme,
  getRootfilePath,
  getTextContent,
  normalizeZipPath,
  readZipEntryText,
  resolveRelativeZipPath,
};
