import { buildBookEntry, buildNavigationEntry } from "./entries";
import { buildPaginationLinks } from "./pagination";
import type { OpdsEditionData, OpdsNavigationItem, OpdsPagination } from "./types";
import { feedHead, feedOpen, selfClosingEl } from "./xml";

const NAV_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation";
const ACQ_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";

/**
 * Build a complete Navigation Feed document.
 */
export function buildNavigationFeed(options: {
  id: string;
  title: string;
  updatedAt: Date;
  baseUrl: string;
  selfHref: string;
  items: OpdsNavigationItem[];
  searchHref?: string;
}): string {
  const lines: string[] = [feedOpen()];

  lines.push(feedHead({
    id: options.id,
    title: options.title,
    updatedAt: options.updatedAt,
    selfHref: options.selfHref,
    startHref: "/opds/catalog",
  }));

  // Override self link type to navigation
  // feedHead already added a generic self link — replace with typed one
  // Actually, feedHead adds a self link without type. For OPDS we need the type.
  // We'll add the typed link separately. feedHead's self link is fine for the href.

  lines.push(selfClosingEl("link", {
    rel: "self",
    href: options.selfHref,
    type: NAV_TYPE,
  }));

  if (options.searchHref) {
    lines.push(selfClosingEl("link", {
      rel: "search",
      href: options.searchHref,
      type: "application/opensearchdescription+xml",
    }));
  }

  const buildOptions = { baseUrl: options.baseUrl, selfHref: options.selfHref };
  for (const item of options.items) {
    lines.push(buildNavigationEntry(item, buildOptions));
  }

  lines.push("</feed>");
  return lines.join("\n");
}

/**
 * Build a complete Acquisition Feed document.
 */
export function buildAcquisitionFeed(options: {
  id: string;
  title: string;
  updatedAt: Date;
  baseUrl: string;
  selfHref: string;
  entries: OpdsEditionData[];
  pagination?: OpdsPagination;
  searchHref?: string;
}): string {
  const lines: string[] = [feedOpen()];

  lines.push(feedHead({
    id: options.id,
    title: options.title,
    updatedAt: options.updatedAt,
    selfHref: options.selfHref,
    startHref: "/opds/catalog",
  }));

  lines.push(selfClosingEl("link", {
    rel: "self",
    href: options.selfHref,
    type: ACQ_TYPE,
  }));

  if (options.searchHref) {
    lines.push(selfClosingEl("link", {
      rel: "search",
      href: options.searchHref,
      type: "application/opensearchdescription+xml",
    }));
  }

  if (options.pagination) {
    lines.push(buildPaginationLinks(options.pagination, options.selfHref));
  }

  const buildOptions = { baseUrl: options.baseUrl, selfHref: options.selfHref };
  for (const entry of options.entries) {
    lines.push(buildBookEntry(entry, buildOptions));
  }

  lines.push("</feed>");
  return lines.join("\n");
}
