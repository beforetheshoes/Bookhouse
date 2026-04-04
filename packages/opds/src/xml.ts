const ESCAPE_MAP = new Map<string, string>([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&apos;"],
]);

const ESCAPE_RE = /[&<>"']/g;

/** Escape the 5 XML special characters. */
export function escapeXml(str: string): string {
  return str.replace(ESCAPE_RE, (ch) => ESCAPE_MAP.get(ch) as string);
}

function formatAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");
}

/** Wrap text in an XML element, escaping content. */
export function el(
  tag: string,
  content: string,
  attrs?: Record<string, string>,
): string {
  const attrStr = attrs ? formatAttrs(attrs) : "";
  return `<${tag}${attrStr}>${escapeXml(content)}</${tag}>`;
}

/** Self-closing XML element. */
export function selfClosingEl(
  tag: string,
  attrs: Record<string, string>,
): string {
  return `<${tag}${formatAttrs(attrs)}/>`;
}

/** XML declaration + root <feed> open tag with all required OPDS namespaces. */
export function feedOpen(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom"',
    '      xmlns:dc="http://purl.org/dc/terms/"',
    '      xmlns:opds="http://opds-spec.org/2010/catalog"',
    '      xmlns:thr="http://purl.org/syndication/thread/1.0"',
    '      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">',
  ].join("\n");
}

/** Common feed-level elements: id, title, updated, author, self/start links. */
export function feedHead(options: {
  id: string;
  title: string;
  updatedAt: Date;
  selfHref: string;
  startHref: string;
}): string {
  return [
    el("id", options.id),
    el("title", options.title),
    el("updated", options.updatedAt.toISOString()),
    "<author><name>Bookhouse</name></author>",
    selfClosingEl("link", { rel: "self", href: options.selfHref }),
    selfClosingEl("link", { rel: "start", href: options.startHref }),
  ].join("\n");
}
