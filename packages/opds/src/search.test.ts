import { describe, expect, it } from "vitest";
import { buildOpenSearchDescriptor } from "./search";

describe("buildOpenSearchDescriptor", () => {
  it("returns valid OpenSearch XML", () => {
    const result = buildOpenSearchDescriptor("https://books.example.com");
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain('<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">');
    expect(result).toContain("<ShortName>Bookhouse</ShortName>");
    expect(result).toContain("<Description>Search the Bookhouse library</Description>");
  });

  it("includes search URL template with baseUrl", () => {
    const result = buildOpenSearchDescriptor("https://mylib.local");
    expect(result).toContain(
      'template="https://mylib.local/opds/search?q={searchTerms}"',
    );
  });

  it("specifies correct result type", () => {
    const result = buildOpenSearchDescriptor("https://books.example.com");
    expect(result).toContain(
      'type="application/atom+xml;profile=opds-catalog;kind=acquisition"',
    );
  });

  it("includes encoding declarations", () => {
    const result = buildOpenSearchDescriptor("https://books.example.com");
    expect(result).toContain("<InputEncoding>UTF-8</InputEncoding>");
    expect(result).toContain("<OutputEncoding>UTF-8</OutputEncoding>");
  });
});
