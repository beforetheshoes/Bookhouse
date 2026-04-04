import { describe, expect, it } from "vitest";
import { buildAcquisitionFeed, buildNavigationFeed } from "./feeds";
import type { OpdsEditionData, OpdsNavigationItem } from "./types";

const NOW = new Date("2024-06-15T12:00:00Z");

function makeNavItem(overrides: Partial<OpdsNavigationItem> = {}): OpdsNavigationItem {
  return {
    title: "Authors",
    href: "/opds/authors",
    count: 10,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeEdition(overrides: Partial<OpdsEditionData> = {}): OpdsEditionData {
  return {
    editionId: "ed-1",
    workId: "work-1",
    titleDisplay: "Test Book",
    sortTitle: null,
    description: null,
    coverPath: null,
    publisher: null,
    publishedAt: null,
    isbn13: null,
    language: null,
    seriesName: null,
    seriesPosition: null,
    updatedAt: NOW,
    contributors: [],
    files: [
      { editionFileId: "ef-1", mimeType: "application/epub+zip", sizeBytes: 1000n, basename: "test.epub" },
    ],
    ...overrides,
  };
}

describe("buildNavigationFeed", () => {
  it("includes XML declaration and feed namespaces", () => {
    const xml = buildNavigationFeed({
      id: "urn:bookhouse:catalog",
      title: "Bookhouse",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/catalog",
      items: [],
    });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain("</feed>");
  });

  it("includes feed id, title, and updated", () => {
    const xml = buildNavigationFeed({
      id: "urn:bookhouse:catalog",
      title: "Bookhouse",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/catalog",
      items: [],
    });
    expect(xml).toContain("<id>urn:bookhouse:catalog</id>");
    expect(xml).toContain("<title>Bookhouse</title>");
    expect(xml).toContain("<updated>2024-06-15T12:00:00.000Z</updated>");
  });

  it("includes self link with navigation type", () => {
    const xml = buildNavigationFeed({
      id: "urn:bookhouse:catalog",
      title: "Bookhouse",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/catalog",
      items: [],
    });
    expect(xml).toContain('type="application/atom+xml;profile=opds-catalog;kind=navigation"');
  });

  it("includes start link", () => {
    const xml = buildNavigationFeed({
      id: "urn:bookhouse:catalog",
      title: "Bookhouse",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/catalog",
      items: [],
    });
    expect(xml).toContain('rel="start"');
    expect(xml).toContain('href="https://books.example.com/opds/catalog"');
  });

  it("includes navigation entries", () => {
    const xml = buildNavigationFeed({
      id: "urn:bookhouse:catalog",
      title: "Bookhouse",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/catalog",
      items: [makeNavItem(), makeNavItem({ title: "Series", href: "/opds/series", count: 5 })],
    });
    expect(xml).toContain("<title>Authors</title>");
    expect(xml).toContain("<title>Series</title>");
    expect(xml).toContain('thr:count="10"');
    expect(xml).toContain('thr:count="5"');
  });

  it("includes search link when provided", () => {
    const xml = buildNavigationFeed({
      id: "urn:bookhouse:catalog",
      title: "Bookhouse",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/catalog",
      items: [],
      searchHref: "/opds/opensearch.xml",
    });
    expect(xml).toContain('rel="search"');
    expect(xml).toContain('href="https://books.example.com/opds/opensearch.xml"');
    expect(xml).toContain('type="application/opensearchdescription+xml"');
  });

  it("omits search link when not provided", () => {
    const xml = buildNavigationFeed({
      id: "urn:bookhouse:catalog",
      title: "Bookhouse",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/catalog",
      items: [],
    });
    expect(xml).not.toContain('rel="search"');
  });
});

describe("buildAcquisitionFeed", () => {
  it("includes XML declaration and closing tag", () => {
    const xml = buildAcquisitionFeed({
      id: "urn:bookhouse:all",
      title: "All Books",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/all",
      entries: [],
    });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("</feed>");
  });

  it("includes self link with acquisition type", () => {
    const xml = buildAcquisitionFeed({
      id: "urn:bookhouse:all",
      title: "All Books",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/all",
      entries: [],
    });
    expect(xml).toContain('type="application/atom+xml;profile=opds-catalog;kind=acquisition"');
  });

  it("includes book entries", () => {
    const xml = buildAcquisitionFeed({
      id: "urn:bookhouse:all",
      title: "All Books",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/all",
      entries: [makeEdition(), makeEdition({ editionId: "ed-2", titleDisplay: "Second Book" })],
    });
    expect(xml).toContain("<title>Test Book</title>");
    expect(xml).toContain("<title>Second Book</title>");
    expect(xml).toContain('rel="http://opds-spec.org/acquisition/open-access"');
  });

  it("includes pagination links when provided", () => {
    const xml = buildAcquisitionFeed({
      id: "urn:bookhouse:all",
      title: "All Books",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/all",
      entries: [makeEdition()],
      pagination: {
        page: 2,
        perPage: 25,
        totalResults: 75,
        hasNext: true,
        hasPrevious: true,
      },
    });
    expect(xml).toContain('rel="next"');
    expect(xml).toContain('rel="previous"');
    expect(xml).toContain("<opensearch:totalResults>75</opensearch:totalResults>");
  });

  it("omits pagination when not provided", () => {
    const xml = buildAcquisitionFeed({
      id: "urn:bookhouse:all",
      title: "All Books",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/all",
      entries: [],
    });
    expect(xml).not.toContain("opensearch:totalResults");
    expect(xml).not.toContain('rel="next"');
  });

  it("includes search link when provided", () => {
    const xml = buildAcquisitionFeed({
      id: "urn:bookhouse:all",
      title: "All Books",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/all",
      entries: [],
      searchHref: "/opds/opensearch.xml",
    });
    expect(xml).toContain('rel="search"');
  });

  it("renders empty feed with no entries", () => {
    const xml = buildAcquisitionFeed({
      id: "urn:bookhouse:all",
      title: "All Books",
      updatedAt: NOW,
      baseUrl: "https://books.example.com",
      selfHref: "/opds/all",
      entries: [],
    });
    expect(xml).not.toContain("<entry>");
    expect(xml).toContain("<feed");
    expect(xml).toContain("</feed>");
  });
});
