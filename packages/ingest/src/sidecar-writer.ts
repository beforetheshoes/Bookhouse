import path from "node:path";
import { mkdir as nodeMkdir, writeFile as nodeWriteFile } from "node:fs/promises";
import nodeSharp from "sharp";
import type { ParsedAudiobookMetadataJsonRaw } from "./audiobook";
import type { ParsedOpfMetadataRaw } from "./opf";

type SidecarValue = string | number | boolean | null | SidecarValue[] | { [key: string]: SidecarValue };

export interface SidecarWriterDeps {
  mkdir: (p: string, opts: { recursive: true }) => Promise<string | undefined>;
  writeFile: (p: string, data: string | Buffer) => Promise<void>;
}

export interface CoverWriterDeps extends SidecarWriterDeps {
  sharp: typeof nodeSharp;
}

const COVER_JPEG_QUALITY = 90;

const defaultSidecarDeps: SidecarWriterDeps = {
  mkdir: nodeMkdir,
  writeFile: nodeWriteFile,
};

const defaultCoverDeps: CoverWriterDeps = {
  ...defaultSidecarDeps,
  sharp: nodeSharp,
};

export function buildAudiobookMetadataJson(
  data: ParsedAudiobookMetadataJsonRaw,
): string {
  // Build an object that omits undefined optional fields so the on-disk
  // sidecar matches what the user supplied (and what the parser expects).
  const out: Record<string, SidecarValue> = {
    title: data.title,
    authors: data.authors,
    narrators: data.narrators,
    series: data.series,
    genres: data.genres,
  };
  if (data.subtitle !== undefined) out.subtitle = data.subtitle;
  if (data.publisher !== undefined) out.publisher = data.publisher;
  if (data.publishedYear !== undefined) out.publishedYear = data.publishedYear;
  if (data.description !== undefined) out.description = data.description;
  if (data.language !== undefined) out.language = data.language;
  if (data.isbn !== undefined) out.isbn = data.isbn;
  if (data.asin !== undefined) out.asin = data.asin;

  return `${JSON.stringify(out, null, 2)}\n`;
}

export async function writeAudiobookMetadataJson(
  dir: string,
  data: ParsedAudiobookMetadataJsonRaw,
  deps: SidecarWriterDeps = defaultSidecarDeps,
): Promise<void> {
  await deps.mkdir(dir, { recursive: true });
  await deps.writeFile(
    path.join(dir, "metadata.json"),
    buildAudiobookMetadataJson(data),
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeAttr(value: string): string {
  return escapeXml(value);
}

export function buildOpfXml(data: ParsedOpfMetadataRaw): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookhouse-id">',
  );
  lines.push("  <metadata>");

  if (data.title !== undefined) {
    lines.push(`    <dc:title>${escapeXml(data.title)}</dc:title>`);
  }

  for (const author of data.authors) {
    const fileAs = author.fileAs !== undefined
      ? ` opf:file-as="${escapeAttr(author.fileAs)}"`
      : "";
    const role = author.role !== undefined
      ? ` opf:role="${escapeAttr(author.role)}"`
      : "";
    lines.push(
      `    <dc:creator${fileAs}${role}>${escapeXml(author.name)}</dc:creator>`,
    );
  }

  for (const identifier of data.identifiers) {
    const scheme = identifier.scheme !== undefined
      ? ` opf:scheme="${escapeAttr(identifier.scheme)}"`
      : "";
    lines.push(
      `    <dc:identifier${scheme}>${escapeXml(identifier.value)}</dc:identifier>`,
    );
  }

  if (data.description !== undefined) {
    lines.push(
      `    <dc:description>${escapeXml(data.description)}</dc:description>`,
    );
  }

  for (const subject of data.subjects) {
    lines.push(`    <dc:subject>${escapeXml(subject)}</dc:subject>`);
  }

  if (data.publisher !== undefined) {
    lines.push(
      `    <dc:publisher>${escapeXml(data.publisher)}</dc:publisher>`,
    );
  }

  if (data.date !== undefined) {
    lines.push(`    <dc:date>${escapeXml(data.date)}</dc:date>`);
  }

  if (data.language !== undefined) {
    lines.push(`    <dc:language>${escapeXml(data.language)}</dc:language>`);
  }

  if (data.series !== undefined) {
    lines.push(
      `    <meta name="calibre:series" content="${escapeAttr(data.series.name)}"/>`,
    );
    if (data.series.index !== undefined) {
      lines.push(
        `    <meta name="calibre:series_index" content="${escapeAttr(String(data.series.index))}"/>`,
      );
    }
  }

  lines.push("  </metadata>");
  lines.push("</package>");
  return `${lines.join("\n")}\n`;
}

export async function writeOpfSidecar(
  dir: string,
  data: ParsedOpfMetadataRaw,
  deps: SidecarWriterDeps = defaultSidecarDeps,
): Promise<void> {
  await deps.mkdir(dir, { recursive: true });
  await deps.writeFile(path.join(dir, "metadata.opf"), buildOpfXml(data));
}

export async function writeCoverJpeg(
  dir: string,
  imageBuffer: Buffer,
  deps: CoverWriterDeps = defaultCoverDeps,
): Promise<void> {
  await deps.mkdir(dir, { recursive: true });
  const jpegBuffer = await deps.sharp(imageBuffer).jpeg({ quality: COVER_JPEG_QUALITY }).toBuffer();
  await deps.writeFile(path.join(dir, "cover.jpg"), jpegBuffer);
}
