import { describe, expect, it } from "vitest";
import { el, escapeXml, feedHead, feedOpen, selfClosingEl } from "./xml";

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes less-than", () => {
    expect(escapeXml("a < b")).toBe("a &lt; b");
  });

  it("escapes greater-than", () => {
    expect(escapeXml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeXml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  it("escapes all special characters together", () => {
    expect(escapeXml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;",
    );
  });

  it("returns empty string unchanged", () => {
    expect(escapeXml("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

describe("el", () => {
  it("wraps content in a tag", () => {
    expect(el("title", "My Book")).toBe("<title>My Book</title>");
  });

  it("escapes content", () => {
    expect(el("title", "A & B")).toBe("<title>A &amp; B</title>");
  });

  it("includes attributes", () => {
    expect(el("link", "text", { rel: "self", type: "text/xml" })).toBe(
      '<link rel="self" type="text/xml">text</link>',
    );
  });

  it("escapes attribute values", () => {
    expect(el("a", "click", { href: '/path?a=1&b="2"' })).toBe(
      '<a href="/path?a=1&amp;b=&quot;2&quot;">click</a>',
    );
  });
});

describe("selfClosingEl", () => {
  it("creates a self-closing element with attributes", () => {
    expect(selfClosingEl("link", { rel: "self", href: "/catalog" })).toBe(
      '<link rel="self" href="/catalog"/>',
    );
  });

  it("escapes attribute values", () => {
    expect(selfClosingEl("link", { href: "/search?q=a&b" })).toBe(
      '<link href="/search?q=a&amp;b"/>',
    );
  });
});

describe("feedOpen", () => {
  it("includes XML declaration and all required namespaces", () => {
    const result = feedOpen();
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(result).toContain('xmlns:dc="http://purl.org/dc/terms/"');
    expect(result).toContain(
      'xmlns:opds="http://opds-spec.org/2010/catalog"',
    );
    expect(result).toContain(
      'xmlns:thr="http://purl.org/syndication/thread/1.0"',
    );
    expect(result).toContain(
      'xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"',
    );
  });
});

describe("feedHead", () => {
  const baseOptions = {
    id: "urn:bookhouse:catalog",
    title: "Bookhouse",
    updatedAt: new Date("2024-06-15T12:00:00Z"),
    selfHref: "/opds/catalog",
    startHref: "/opds/catalog",
  };

  it("includes id, title, updated, and link elements", () => {
    const result = feedHead(baseOptions);
    expect(result).toContain("<id>urn:bookhouse:catalog</id>");
    expect(result).toContain("<title>Bookhouse</title>");
    expect(result).toContain("<updated>2024-06-15T12:00:00.000Z</updated>");
    expect(result).toContain('href="/opds/catalog"');
    expect(result).toContain('rel="start"');
  });

  it("includes author element with Bookhouse name", () => {
    const result = feedHead(baseOptions);
    expect(result).toContain("<author>");
    expect(result).toContain("<name>Bookhouse</name>");
    expect(result).toContain("</author>");
  });

  it("escapes special characters in title", () => {
    const result = feedHead({ ...baseOptions, title: "Books & More" });
    expect(result).toContain("<title>Books &amp; More</title>");
  });
});
