import { describe, expect, it, vi } from "vitest";
import { parseOpfXml, parseOpfSidecar } from "./opf";

const CALIBRE_OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid_id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>The Name of the Wind</dc:title>
    <dc:creator opf:file-as="Rothfuss, Patrick" opf:role="aut">Patrick Rothfuss</dc:creator>
    <dc:identifier id="isbn_id" opf:scheme="ISBN">9780756404079</dc:identifier>
    <dc:identifier opf:scheme="uuid">urn:uuid:12345678</dc:identifier>
    <dc:description>&lt;p&gt;A story about Kvothe.&lt;/p&gt;</dc:description>
    <dc:subject>Fantasy</dc:subject>
    <dc:subject>Adventure</dc:subject>
    <dc:publisher>DAW Books</dc:publisher>
    <dc:date>2007-03-27</dc:date>
    <dc:language>en</dc:language>
    <meta name="calibre:series" content="The Kingkiller Chronicle"/>
    <meta name="calibre:series_index" content="1.0"/>
  </metadata>
</package>`;

describe("parseOpfXml", () => {
  it("parses a full Calibre OPF with title, authors, identifiers, series and extended fields", () => {
    const result = parseOpfXml(CALIBRE_OPF);

    expect(result.title).toBe("The Name of the Wind");
    expect(result.authors).toEqual([
      { name: "Patrick Rothfuss", fileAs: "Rothfuss, Patrick", role: "aut" },
    ]);
    expect(result.identifiers).toEqual([
      { scheme: "ISBN", value: "9780756404079" },
      { scheme: "uuid", value: "urn:uuid:12345678" },
    ]);
    expect(result.description).toBe("<p>A story about Kvothe.</p>");
    expect(result.subjects).toEqual(["Fantasy", "Adventure"]);
    expect(result.publisher).toBe("DAW Books");
    expect(result.date).toBe("2007-03-27");
    expect(result.language).toBe("en");
    expect(result.series).toEqual({ name: "The Kingkiller Chronicle", index: 1 });
  });

  it("returns undefined series when no Calibre series meta is present", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Standalone</dc:title>
  </metadata>
</package>`;
    const result = parseOpfXml(xml);
    expect(result.series).toBeUndefined();
    expect(result.subjects).toEqual([]);
    expect(result.authors).toEqual([]);
    expect(result.identifiers).toEqual([]);
  });

  it("handles plain string creator (no attributes)", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:creator>Terry Pratchett</dc:creator>
    <dc:creator>Neil Gaiman</dc:creator>
  </metadata>
</package>`;
    const result = parseOpfXml(xml);
    expect(result.authors).toEqual([
      { name: "Terry Pratchett", fileAs: undefined, role: undefined },
      { name: "Neil Gaiman", fileAs: undefined, role: undefined },
    ]);
  });

  it("handles creator with only file-as (no role) and creator with only role (no file-as)", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:creator opf:file-as="Pratchett, Terry">Terry Pratchett</dc:creator>
    <dc:creator opf:role="aut">Neil Gaiman</dc:creator>
  </metadata>
</package>`;
    const result = parseOpfXml(xml);
    expect(result.authors).toEqual([
      { name: "Terry Pratchett", fileAs: "Pratchett, Terry", role: undefined },
      { name: "Neil Gaiman", fileAs: undefined, role: "aut" },
    ]);
  });

  it("handles plain string identifier (no attributes)", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier>9780756404079</dc:identifier>
  </metadata>
</package>`;
    const result = parseOpfXml(xml);
    expect(result.identifiers).toEqual([{ value: "9780756404079" }]);
  });

  it("ignores non-object meta entries when scanning for calibre series", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Standalone</dc:title>
    <meta>plain text meta</meta>
  </metadata>
</package>`;
    const result = parseOpfXml(xml);
    expect(result.series).toBeUndefined();
  });

  it("handles calibre:series_index with invalid value gracefully", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <meta name="calibre:series" content="My Series"/>
    <meta name="calibre:series_index" content="not-a-number"/>
  </metadata>
</package>`;
    const result = parseOpfXml(xml);
    expect(result.series).toEqual({ name: "My Series", index: undefined });
  });

  it("throws when the OPF document contains no metadata element", () => {
    expect(() => parseOpfXml("<package></package>")).toThrow(
      "OPF document did not contain metadata",
    );
  });

  it("skips creators that have no text content", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:creator opf:file-as="Unknown"/>
  </metadata>
</package>`;
    const result = parseOpfXml(xml);
    // Creator with only attribute and no text content → no name → filtered out
    expect(result.authors).toEqual([]);
  });

  it("skips identifiers that are objects but have no text content", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier opf:scheme="uuid"/>
  </metadata>
</package>`;
    const result = parseOpfXml(xml);
    // Identifier with only attribute and no text content → filtered out
    expect(result.identifiers).toEqual([]);
  });
});

describe("parseOpfSidecar", () => {
  it("reads a file and parses it as OPF XML", async () => {
    vi.mock("node:fs/promises", () => ({
      readFile: vi.fn(async () => CALIBRE_OPF),
    }));

    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce(CALIBRE_OPF as never);

    const result = await parseOpfSidecar("/library/Author/Book/metadata.opf");

    expect(result.title).toBe("The Name of the Wind");
    expect(result.series).toEqual({ name: "The Kingkiller Chronicle", index: 1 });

    vi.restoreAllMocks();
  });
});
