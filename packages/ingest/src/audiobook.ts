import { readFile } from "node:fs/promises";
import { parseFile } from "music-metadata";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ParsedAudiobookMetadataJsonRaw {
  title: string;
  subtitle?: string;
  authors: string[];
  narrators: string[];
  series: Array<{ name: string; sequence: string }>;
  publisher?: string;
  publishedYear?: string;
  description?: string;
  genres: string[];
  language?: string;
  isbn?: string;
  asin?: string;
}

export interface ParsedAudioId3TagsRaw {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  year?: number;
  genres: string[];
  comment?: string;
  trackNumber?: number;
  trackTotal?: number;
}

function ensureStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function ensureSeriesArray(value: JsonValue | undefined): Array<{ name: string; sequence: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is { name: string; sequence: string } =>
      typeof item === "object" &&
      item !== null &&
      !Array.isArray(item) &&
      typeof item.name === "string" &&
      typeof item.sequence === "string",
  );
}

function optionalString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function parseAudiobookMetadataJson(
  absolutePath: string,
): Promise<ParsedAudiobookMetadataJsonRaw> {
  const content = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(content) as JsonValue;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("metadata.json content is not an object");
  }

  const obj = parsed as Record<string, JsonValue>;

  if (typeof obj.title !== "string") {
    throw new Error("metadata.json missing required field: title");
  }

  return {
    title: obj.title,
    subtitle: optionalString(obj.subtitle),
    authors: ensureStringArray(obj.authors),
    narrators: ensureStringArray(obj.narrators),
    series: ensureSeriesArray(obj.series),
    publisher: optionalString(obj.publisher),
    publishedYear: optionalString(obj.publishedYear),
    description: optionalString(obj.description),
    genres: ensureStringArray(obj.genres),
    language: optionalString(obj.language),
    isbn: optionalString(obj.isbn),
    asin: optionalString(obj.asin),
  };
}

export interface ParseAudioId3Result {
  tags: ParsedAudioId3TagsRaw;
  warnings: string[];
}

export async function parseAudioId3Tags(
  absolutePath: string,
): Promise<ParseAudioId3Result> {
  try {
    const metadata = await parseFile(absolutePath);
    const { common } = metadata;

    return {
      tags: {
        title: common.title,
        artist: common.artist,
        albumArtist: common.albumartist,
        album: common.album,
        year: common.year,
        genres: common.genre ?? [],
        comment: common.comment?.[0]?.text,
        trackNumber: common.track.no ?? undefined,
        trackTotal: common.track.of ?? undefined,
      },
      warnings: [],
    };
  } catch (error) {
    // All ID3 parsing errors are non-fatal: the file exists, we just can't
    // read its tags. Return empty tags with the error as a warning so the
    // file continues through the pipeline instead of being stuck as
    // "unparseable" forever.
    return {
      tags: {
        title: undefined,
        artist: undefined,
        albumArtist: undefined,
        album: undefined,
        year: undefined,
        genres: [],
        comment: undefined,
        trackNumber: undefined,
        trackTotal: undefined,
      },
      warnings: [error instanceof Error ? error.message : "Unknown ID3 parsing error"],
    };
  }
}
