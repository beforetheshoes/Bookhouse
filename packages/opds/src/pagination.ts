import type { OpdsPagination } from "./types";
import { el, selfClosingEl } from "./xml";

const FEED_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";

/**
 * Generate RFC 5005 pagination link elements and OpenSearch elements.
 * @param pagination - Current pagination state.
 * @param baseHref - Base path for pagination links (without query params).
 */
export function buildPaginationLinks(
  pagination: OpdsPagination,
  baseHref: string,
): string {
  const lines: string[] = [];

  lines.push(selfClosingEl("link", {
    rel: "first",
    href: `${baseHref}?page=1`,
    type: FEED_TYPE,
  }));

  if (pagination.hasPrevious) {
    lines.push(selfClosingEl("link", {
      rel: "previous",
      href: `${baseHref}?page=${String(pagination.page - 1)}`,
      type: FEED_TYPE,
    }));
  }

  if (pagination.hasNext) {
    lines.push(selfClosingEl("link", {
      rel: "next",
      href: `${baseHref}?page=${String(pagination.page + 1)}`,
      type: FEED_TYPE,
    }));
  }

  lines.push(el("opensearch:totalResults", String(pagination.totalResults)));
  lines.push(el("opensearch:itemsPerPage", String(pagination.perPage)));
  lines.push(el("opensearch:startIndex", String((pagination.page - 1) * pagination.perPage)));

  return lines.join("\n");
}
