import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import yazl from "yazl";
import { afterEach, describe, expect, it } from "vitest";
import { parseEpubMetadata } from "./index";
import { EPUB_INTERNALS } from "./epub";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { force: true, recursive: true })));
  tempDirectories.length = 0;
});

async function createEpub(entries: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-epub-"));
  tempDirectories.push(directory);
  const outputPath = path.join(directory, "book.epub");
  const zipfile = new yazl.ZipFile();
  const output = createWriteStream(outputPath);

  zipfile.outputStream.pipe(output);

  for (const [entryPath, contents] of Object.entries(entries)) {
    zipfile.addBuffer(Buffer.from(contents, "utf8"), entryPath);
  }

  zipfile.end();
  await once(output, "close");

  return outputPath;
}

describe("EPUB metadata parser", () => {
  it("parses title, creators, and identifiers from a standard EPUB", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="content.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
      "content.opf": `<?xml version="1.0" encoding="utf-8"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title> The Fifth Season </dc:title>
            <dc:creator> N. K. Jemisin </dc:creator>
            <dc:creator> Another Author </dc:creator>
            <dc:identifier id="pub-id">978-0-316-49883-4</dc:identifier>
            <dc:identifier opf:scheme="ASIN" xmlns:opf="http://www.idpf.org/2007/opf">B012345678</dc:identifier>
          </metadata>
        </package>`,
    });

    await expect(parseEpubMetadata(epubPath)).resolves.toEqual({
      authors: ["N. K. Jemisin", "Another Author"],
      identifiers: [
        { value: "978-0-316-49883-4" },
        { scheme: "ASIN", value: "B012345678" },
      ],
      title: "The Fifth Season",
    });
  });

  it("resolves nested OPF paths and identifier-type refinements", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
      "OEBPS/package.opf": `<?xml version="1.0" encoding="utf-8"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Nested Book</dc:title>
            <dc:creator>Author Name</dc:creator>
            <dc:identifier id="isbn">0-316-49901-5</dc:identifier>
            <meta refines="#isbn" property="identifier-type">ISBN-10</meta>
          </metadata>
        </package>`,
    });

    await expect(parseEpubMetadata(epubPath)).resolves.toEqual({
      authors: ["Author Name"],
      identifiers: [{ scheme: "ISBN-10", value: "0-316-49901-5" }],
      title: "Nested Book",
    });
  });

  it("throws for missing container metadata", async () => {
    const epubPath = await createEpub({
      "content.opf": `<package><metadata /></package>`,
    });

    await expect(parseEpubMetadata(epubPath)).rejects.toThrow(
      'EPUB entry "META-INF/container.xml" was not found',
    );
  });

  it("throws for missing package documents", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="missing.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
    });

    await expect(parseEpubMetadata(epubPath)).rejects.toThrow(
      'EPUB entry "missing.opf" was not found',
    );
  });

  it("throws for malformed XML", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<container><rootfiles><rootfile full-path="content.opf"></container>`,
      "content.opf": `<package><metadata /></package>`,
    });

    await expect(parseEpubMetadata(epubPath)).rejects.toThrow();
  });

  it("covers internal package parsing edge cases", async () => {
    expect(
      EPUB_INTERNALS.normalizeZipPath("./OPS/../OEBPS/./content.opf"),
    ).toBe("OEBPS/content.opf");
    expect(
      EPUB_INTERNALS.resolveRelativeZipPath("OPS/package.opf", "../content.opf"),
    ).toBe("content.opf");
    expect(
      EPUB_INTERNALS.getTextContent({ "#text": "hash-text" }),
    ).toBe("hash-text");
    expect(EPUB_INTERNALS.getTextContent({ text: "plain-text" })).toBe("plain-text");
    expect(EPUB_INTERNALS.getTextContent(null)).toBeUndefined();
    expect(EPUB_INTERNALS.getIdentifierScheme({ scheme: "uuid" }, {})).toBe("uuid");
    expect(EPUB_INTERNALS.getIdentifierScheme({ "opf:scheme": "ASIN" }, {})).toBe("ASIN");
    expect(EPUB_INTERNALS.getIdentifierScheme({}, {})).toBeUndefined();
    expect(
      EPUB_INTERNALS.getIdentifierScheme(
        { id: "pub-id" },
        { meta: [{ refines: "#other-id", property: "identifier-type", "#text": "ISBN-13" }] },
      ),
    ).toBeUndefined();
    expect(
      EPUB_INTERNALS.getIdentifierScheme(
        { id: "pub-id" },
        { meta: [{ refines: "#pub-id", property: "identifier-type", "#text": "ISBN-13" }] },
      ),
    ).toBe("ISBN-13");
    expect(
      EPUB_INTERNALS.getPackageMetadata(`<?xml version="1.0"?>
        <package xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Edge Case Book</dc:title>
            <dc:creator>Author</dc:creator>
            <dc:identifier scheme="uuid">scheme-id</dc:identifier>
            <dc:identifier dir="ltr">plain-object-id</dc:identifier>
            <dc:identifier><meta /></dc:identifier>
            <dc:identifier>plain-string-id</dc:identifier>
          </metadata>
        </package>`),
    ).toEqual({
      authors: ["Author"],
      identifiers: [
        { scheme: "uuid", value: "scheme-id" },
        { scheme: undefined, value: "plain-object-id" },
        { value: "plain-string-id" },
      ],
      title: "Edge Case Book",
    });
    expect(() =>
      EPUB_INTERNALS.getRootfilePath(`<?xml version="1.0"?>
        <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile media-type="application/oebps-package+xml" /></rootfiles>
        </container>`),
    ).toThrow('EPUB container.xml did not declare a rootfile "full-path"');
    expect(() =>
      EPUB_INTERNALS.getPackageMetadata(`<package></package>`),
    ).toThrow("EPUB package document did not contain metadata");
    await expect(
      EPUB_INTERNALS.readZipEntryText("/definitely/missing.epub", "content.opf"),
    ).rejects.toThrow();
  });
});
