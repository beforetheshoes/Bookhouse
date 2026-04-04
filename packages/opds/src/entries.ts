import type { OpdsBuildOptions, OpdsEditionData, OpdsNavigationItem } from "./types";
import { el, escapeXml, selfClosingEl } from "./xml";

const MAX_SUMMARY_LENGTH = 500;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * Build an OPDS Catalog Entry for a book edition.
 * Includes acquisition links, cover links, DC metadata.
 */
export function buildBookEntry(
  edition: OpdsEditionData,
  options: OpdsBuildOptions,
): string {
  const lines: string[] = ["<entry>"];

  lines.push(el("id", `urn:bookhouse:edition:${edition.editionId}`));
  lines.push(el("title", edition.titleDisplay));
  lines.push(el("updated", edition.updatedAt.toISOString()));

  for (const c of edition.contributors) {
    if (c.role === "AUTHOR") {
      lines.push(`<author><name>${escapeXml(c.name)}</name></author>`);
    }
  }

  if (edition.description) {
    lines.push(`<summary type="text">${escapeXml(truncate(edition.description, MAX_SUMMARY_LENGTH))}</summary>`);
  }

  if (edition.language) {
    lines.push(el("dc:language", edition.language));
  }
  if (edition.publisher) {
    lines.push(el("dc:publisher", edition.publisher));
  }
  if (edition.publishedAt) {
    lines.push(el("dc:issued", String(edition.publishedAt.getFullYear())));
  }
  if (edition.isbn13) {
    lines.push(el("dc:identifier", `urn:isbn:${edition.isbn13}`));
  }

  if (edition.seriesName) {
    const label = edition.seriesPosition != null
      ? `${edition.seriesName} #${String(edition.seriesPosition)}`
      : edition.seriesName;
    lines.push(selfClosingEl("category", {
      term: edition.seriesName,
      label,
    }));
  }

  if (edition.coverPath) {
    lines.push(selfClosingEl("link", {
      rel: "http://opds-spec.org/image",
      href: `${options.baseUrl}/opds/covers/${edition.coverPath}/medium`,
      type: "image/jpeg",
    }));
    lines.push(selfClosingEl("link", {
      rel: "http://opds-spec.org/image/thumbnail",
      href: `${options.baseUrl}/opds/covers/${edition.coverPath}/thumb`,
      type: "image/jpeg",
    }));
  }

  for (const f of edition.files) {
    const attrs: Record<string, string> = {
      rel: "http://opds-spec.org/acquisition/open-access",
      href: `${options.baseUrl}/opds/download/${f.editionFileId}`,
      type: f.mimeType ?? "application/octet-stream",
    };
    if (f.sizeBytes != null) {
      attrs.length = String(f.sizeBytes);
    }
    lines.push(selfClosingEl("link", attrs));
  }

  lines.push("</entry>");
  return lines.join("\n");
}

/**
 * Build a navigation entry (link to a sub-feed).
 */
export function buildNavigationEntry(
  item: OpdsNavigationItem,
  options: OpdsBuildOptions,
): string {
  const lines: string[] = ["<entry>"];

  lines.push(el("id", `${options.baseUrl}${item.href}`));
  lines.push(el("title", item.title));
  lines.push(el("updated", item.updatedAt.toISOString()));
  lines.push(`<content type="text">${escapeXml(item.title)}</content>`);

  const linkAttrs: Record<string, string> = {
    href: item.href,
    type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
    rel: "subsection",
  };
  if (item.count != null) {
    linkAttrs["thr:count"] = String(item.count);
  }
  lines.push(selfClosingEl("link", linkAttrs));

  lines.push("</entry>");
  return lines.join("\n");
}
