import { describe, expect, it } from "vitest";
import { buildBookEntry, buildNavigationEntry } from "./entries";
import type { OpdsEditionData, OpdsNavigationItem } from "./types";

function makeEdition(
  overrides: Partial<OpdsEditionData> = {},
): OpdsEditionData {
  return {
    editionId: "ed-1",
    workId: "work-1",
    titleDisplay: "The Great Novel",
    sortTitle: "great novel, the",
    description: "A story about everything.",
    coverPath: "work-1",
    publisher: "Acme Books",
    publishedAt: new Date("2023-03-15"),
    isbn13: "9781234567890",
    language: "en",
    seriesName: "Epic Saga",
    seriesPosition: 2,
    updatedAt: new Date("2024-06-01T12:00:00Z"),
    contributors: [
      { name: "Jane Author", role: "AUTHOR" },
      { name: "Bob Editor", role: "EDITOR" },
    ],
    files: [
      {
        editionFileId: "ef-1",
        mimeType: "application/epub+zip",
        sizeBytes: 1048576n,
        basename: "the-great-novel.epub",
      },
    ],
    ...overrides,
  };
}

const baseOptions = { baseUrl: "https://books.example.com", selfHref: "/opds/all" };

describe("buildBookEntry", () => {
  it("includes id, title, updated", () => {
    const xml = buildBookEntry(makeEdition(), baseOptions);
    expect(xml).toContain("<id>urn:bookhouse:edition:ed-1</id>");
    expect(xml).toContain("<title>The Great Novel</title>");
    expect(xml).toContain("<updated>2024-06-01T12:00:00.000Z</updated>");
  });

  it("includes author elements only for AUTHOR role", () => {
    const xml = buildBookEntry(makeEdition(), baseOptions);
    expect(xml).toContain("<author><name>Jane Author</name></author>");
    expect(xml).not.toContain("Bob Editor");
  });

  it("includes summary from description", () => {
    const xml = buildBookEntry(makeEdition(), baseOptions);
    expect(xml).toContain('<summary type="text">A story about everything.</summary>');
  });

  it("truncates long descriptions to 500 characters", () => {
    const longDesc = "A".repeat(600);
    const xml = buildBookEntry(makeEdition({ description: longDesc }), baseOptions);
    const match = xml.match(/<summary type="text">(.*?)<\/summary>/);
    expect(match).not.toBeNull();
    const summary = match?.[1] ?? "";
    expect(summary.length).toBeLessThanOrEqual(503); // 500 + "..."
    expect(summary.endsWith("...")).toBe(true);
  });

  it("includes Dublin Core metadata", () => {
    const xml = buildBookEntry(makeEdition(), baseOptions);
    expect(xml).toContain("<dc:language>en</dc:language>");
    expect(xml).toContain("<dc:publisher>Acme Books</dc:publisher>");
    expect(xml).toContain("<dc:issued>2023</dc:issued>");
    expect(xml).toContain("<dc:identifier>urn:isbn:9781234567890</dc:identifier>");
  });

  it("includes series as category element", () => {
    const xml = buildBookEntry(makeEdition(), baseOptions);
    expect(xml).toContain('term="Epic Saga"');
    expect(xml).toContain('label="Epic Saga #2"');
  });

  it("includes cover image links", () => {
    const xml = buildBookEntry(makeEdition(), baseOptions);
    expect(xml).toContain('rel="http://opds-spec.org/image"');
    expect(xml).toContain("href=\"https://books.example.com/opds/covers/work-1/medium\"");
    expect(xml).toContain('rel="http://opds-spec.org/image/thumbnail"');
    expect(xml).toContain("href=\"https://books.example.com/opds/covers/work-1/thumb\"");
    expect(xml).toContain('type="image/jpeg"');
  });

  it("includes acquisition links for each file", () => {
    const xml = buildBookEntry(makeEdition(), baseOptions);
    expect(xml).toContain('rel="http://opds-spec.org/acquisition/open-access"');
    expect(xml).toContain("href=\"https://books.example.com/opds/download/ef-1\"");
    expect(xml).toContain('type="application/epub+zip"');
    expect(xml).toContain('length="1048576"');
  });

  it("includes multiple acquisition links for multiple files", () => {
    const edition = makeEdition({
      files: [
        { editionFileId: "ef-1", mimeType: "application/epub+zip", sizeBytes: 1000n, basename: "book.epub" },
        { editionFileId: "ef-2", mimeType: "application/pdf", sizeBytes: 2000n, basename: "book.pdf" },
      ],
    });
    const xml = buildBookEntry(edition, baseOptions);
    expect(xml).toContain("href=\"https://books.example.com/opds/download/ef-1\"");
    expect(xml).toContain("href=\"https://books.example.com/opds/download/ef-2\"");
    expect(xml).toContain('type="application/epub+zip"');
    expect(xml).toContain('type="application/pdf"');
  });

  it("omits summary when description is null", () => {
    const xml = buildBookEntry(makeEdition({ description: null }), baseOptions);
    expect(xml).not.toContain("<summary");
  });

  it("omits dc:language when null", () => {
    const xml = buildBookEntry(makeEdition({ language: null }), baseOptions);
    expect(xml).not.toContain("<dc:language");
  });

  it("omits dc:publisher when null", () => {
    const xml = buildBookEntry(makeEdition({ publisher: null }), baseOptions);
    expect(xml).not.toContain("<dc:publisher");
  });

  it("omits dc:issued when null", () => {
    const xml = buildBookEntry(makeEdition({ publishedAt: null }), baseOptions);
    expect(xml).not.toContain("<dc:issued");
  });

  it("omits dc:identifier when isbn13 is null", () => {
    const xml = buildBookEntry(makeEdition({ isbn13: null }), baseOptions);
    expect(xml).not.toContain("<dc:identifier");
  });

  it("uses series name only in label when position is null", () => {
    const xml = buildBookEntry(makeEdition({ seriesName: "Epic Saga", seriesPosition: null }), baseOptions);
    expect(xml).toContain('label="Epic Saga"');
    expect(xml).not.toContain("#");
  });

  it("omits category when no series", () => {
    const xml = buildBookEntry(makeEdition({ seriesName: null, seriesPosition: null }), baseOptions);
    expect(xml).not.toContain("<category");
  });

  it("omits cover links when coverPath is null", () => {
    const xml = buildBookEntry(makeEdition({ coverPath: null }), baseOptions);
    expect(xml).not.toContain("opds-spec.org/image");
  });

  it("escapes special characters in title and author", () => {
    const xml = buildBookEntry(
      makeEdition({
        titleDisplay: "Tom & Jerry's <Adventure>",
        contributors: [{ name: 'O"Brien & Co', role: "AUTHOR" }],
      }),
      baseOptions,
    );
    expect(xml).toContain("<title>Tom &amp; Jerry&apos;s &lt;Adventure&gt;</title>");
    expect(xml).toContain("<name>O&quot;Brien &amp; Co</name>");
  });

  it("handles edition with no authors", () => {
    const xml = buildBookEntry(makeEdition({ contributors: [] }), baseOptions);
    expect(xml).not.toContain("<author>");
    expect(xml).toContain("<entry>");
  });

  it("uses application/octet-stream for null mimeType", () => {
    const xml = buildBookEntry(
      makeEdition({
        files: [{ editionFileId: "ef-1", mimeType: null, sizeBytes: 100n, basename: "file.bin" }],
      }),
      baseOptions,
    );
    expect(xml).toContain('type="application/octet-stream"');
  });

  it("omits length attribute when sizeBytes is null", () => {
    const xml = buildBookEntry(
      makeEdition({
        files: [{ editionFileId: "ef-1", mimeType: "application/epub+zip", sizeBytes: null, basename: "book.epub" }],
      }),
      baseOptions,
    );
    expect(xml).not.toContain("length=");
  });
});

describe("buildNavigationEntry", () => {
  const item: OpdsNavigationItem = {
    title: "Authors",
    href: "/opds/authors",
    count: 42,
    updatedAt: new Date("2024-06-01T12:00:00Z"),
  };

  it("includes id, title, updated, and link", () => {
    const xml = buildNavigationEntry(item, baseOptions);
    expect(xml).toContain("<title>Authors</title>");
    expect(xml).toContain("<updated>2024-06-01T12:00:00.000Z</updated>");
    expect(xml).toContain('href="/opds/authors"');
    expect(xml).toContain('type="application/atom+xml;profile=opds-catalog;kind=acquisition"');
  });

  it("includes thr:count when count is provided", () => {
    const xml = buildNavigationEntry(item, baseOptions);
    expect(xml).toContain('thr:count="42"');
  });

  it("omits thr:count when count is undefined", () => {
    const xml = buildNavigationEntry({ ...item, count: undefined }, baseOptions);
    expect(xml).not.toContain("thr:count");
  });

  it("generates deterministic id from href", () => {
    const xml = buildNavigationEntry(item, baseOptions);
    expect(xml).toContain("<id>https://books.example.com/opds/authors</id>");
  });

  it("includes content element with Navigation type", () => {
    const xml = buildNavigationEntry(item, baseOptions);
    expect(xml).toContain('<content type="text">');
  });
});
