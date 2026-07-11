import { MediaKind } from "@bookhouse/domain";
import {
  parseAudioId3Tags as defaultParseAudioId3Tags,
  parseAudiobookMetadataJson as defaultParseAudiobookMetadataJson,
} from "./audiobook";
import { parseEpubMetadata as defaultParseEpubMetadata } from "./epub";
import { parseOpfSidecar as defaultParseOpfSidecar } from "./opf";
import { deriveTitleFromPath } from "./filename-title";
import { normalizeBookMetadata, normalizeOpfMetadata } from "./metadata";

export interface UploadFileForDerivation {
  basename: string;
  mediaKind: MediaKind;
  stagingPath: string;
}

export interface DerivedUploadMetadata {
  title?: string;
  author?: string;
  series?: string;
  seriesIndex?: string;
  description?: string;
}

export interface DeriveUploadMetadataDeps {
  parseOpfSidecar?: typeof defaultParseOpfSidecar;
  parseAudiobookMetadataJson?: typeof defaultParseAudiobookMetadataJson;
  parseEpubMetadata?: typeof defaultParseEpubMetadata;
  parseAudioId3Tags?: typeof defaultParseAudioId3Tags;
}

const EPUB_LIKE_KINDS = new Set<MediaKind>([MediaKind.EPUB, MediaKind.KEPUB]);

function fill(target: DerivedUploadMetadata, source: DerivedUploadMetadata): void {
  for (const key of ["title", "author", "series", "seriesIndex", "description"] as const) {
    const value = source[key]?.trim();
    if (target[key] === undefined && value !== undefined && value !== "") {
      target[key] = value;
    }
  }
}

function hasPrimaryFields(derived: DerivedUploadMetadata): boolean {
  return derived.title !== undefined && derived.author !== undefined;
}

function findSidecar(files: UploadFileForDerivation[], basename: string): UploadFileForDerivation | undefined {
  return files.find(
    (f) => f.mediaKind === MediaKind.SIDECAR && f.basename.toLowerCase() === basename,
  );
}

// Best-effort metadata derivation for uploads, so users don't have to type
// what the files already know. Sources in priority order — explicit sidecars
// first, then embedded metadata, then the filename. Unreadable sources are
// skipped, never fatal: worst case the caller gets an empty object back.
export async function deriveUploadMetadata(
  files: UploadFileForDerivation[],
  deps: DeriveUploadMetadataDeps = {},
): Promise<DerivedUploadMetadata> {
  const parseOpfSidecar = deps.parseOpfSidecar ?? defaultParseOpfSidecar;
  const parseAudiobookMetadataJson = deps.parseAudiobookMetadataJson ?? defaultParseAudiobookMetadataJson;
  const parseEpubMetadata = deps.parseEpubMetadata ?? defaultParseEpubMetadata;
  const parseAudioId3Tags = deps.parseAudioId3Tags ?? defaultParseAudioId3Tags;

  const derived: DerivedUploadMetadata = {};

  const opfSidecar = findSidecar(files, "metadata.opf");
  if (opfSidecar) {
    try {
      const normalized = normalizeOpfMetadata(await parseOpfSidecar(opfSidecar.stagingPath));
      fill(derived, {
        title: normalized.title,
        author: normalized.authors[0],
        series: normalized.series?.name,
        seriesIndex: normalized.series?.index !== undefined ? String(normalized.series.index) : undefined,
        description: normalized.description,
      });
    } catch {
      // Unreadable sidecar — fall through to the next source.
    }
  }
  if (hasPrimaryFields(derived)) return derived;

  const jsonSidecar = findSidecar(files, "metadata.json");
  if (jsonSidecar) {
    try {
      const json = await parseAudiobookMetadataJson(jsonSidecar.stagingPath);
      fill(derived, {
        title: json.title,
        author: json.authors[0],
        series: json.series[0]?.name,
        seriesIndex: json.series[0]?.sequence,
        description: json.description,
      });
    } catch {
      // Unreadable sidecar — fall through to the next source.
    }
  }
  if (hasPrimaryFields(derived)) return derived;

  const epubFile = files.find((f) => EPUB_LIKE_KINDS.has(f.mediaKind));
  if (epubFile) {
    try {
      const normalized = normalizeBookMetadata(await parseEpubMetadata(epubFile.stagingPath));
      fill(derived, { title: normalized.title, author: normalized.authors[0] });
    } catch {
      // Corrupt or non-standard EPUB — fall through to the next source.
    }
  }
  if (hasPrimaryFields(derived)) return derived;

  const audioFile = files.find((f) => f.mediaKind === MediaKind.AUDIO);
  if (audioFile) {
    // parseAudioId3Tags never throws; unreadable tags come back empty.
    const { tags } = await parseAudioId3Tags(audioFile.stagingPath);
    fill(derived, {
      title: tags.album ?? tags.title,
      author: tags.albumArtist ?? tags.artist,
    });
  }

  if (derived.title === undefined) {
    const contentFile = epubFile ?? audioFile ?? files.find((f) => f.mediaKind !== MediaKind.SIDECAR && f.mediaKind !== MediaKind.COVER);
    if (contentFile) {
      fill(derived, { title: deriveTitleFromPath(contentFile.basename, contentFile.mediaKind).title });
    }
  }

  return derived;
}
