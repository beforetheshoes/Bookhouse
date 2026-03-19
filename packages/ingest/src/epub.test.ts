import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import yazl from "yazl";
import { afterEach, describe, expect, it } from "vitest";
import { parseEpubMetadata, extractEpubCover } from "./index";
import { EPUB_INTERNALS } from "./epub";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { force: true, recursive: true })));
  tempDirectories.length = 0;
});

interface EpubEntries {
  [path: string]: string | Buffer;
}

async function createEpub(entries: EpubEntries): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-epub-"));
  tempDirectories.push(directory);
  const outputPath = path.join(directory, "book.epub");
  const zipfile = new yazl.ZipFile();
  const output = createWriteStream(outputPath);

  zipfile.outputStream.pipe(output);

  for (const [entryPath, contents] of Object.entries(entries)) {
    const buffer = typeof contents === "string" ? Buffer.from(contents, "utf8") : contents;
    zipfile.addBuffer(buffer, entryPath);
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

describe("EPUB cover extraction", () => {
  const FAKE_COVER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it("extracts cover via EPUB 3 properties='cover-image'", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="content.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
      "content.opf": `<?xml version="1.0" encoding="utf-8"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Cover Test</dc:title>
          </metadata>
          <manifest>
            <item id="cover" href="cover.png" media-type="image/png" properties="cover-image" />
            <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" />
          </manifest>
        </package>`,
      "cover.png": FAKE_COVER,
    });

    const result = await extractEpubCover(epubPath);
    expect(result).toEqual({ buffer: FAKE_COVER, mediaType: "image/png" });
  });

  it("extracts cover via EPUB 2 meta name='cover' fallback", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="content.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
      "content.opf": `<?xml version="1.0" encoding="utf-8"?>
        <package version="2.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>EPUB 2 Cover</dc:title>
            <meta name="cover" content="cover-img" />
          </metadata>
          <manifest>
            <item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" />
          </manifest>
        </package>`,
      "images/cover.jpg": FAKE_COVER,
    });

    const result = await extractEpubCover(epubPath);
    expect(result).toEqual({ buffer: FAKE_COVER, mediaType: "image/jpeg" });
  });

  it("returns null when no cover is in the manifest", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="content.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
      "content.opf": `<?xml version="1.0" encoding="utf-8"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>No Cover</dc:title>
          </metadata>
          <manifest>
            <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" />
          </manifest>
        </package>`,
    });

    const result = await extractEpubCover(epubPath);
    expect(result).toBeNull();
  });

  it("resolves cover paths relative to OPF directory", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
      "OEBPS/content.opf": `<?xml version="1.0" encoding="utf-8"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Nested Cover</dc:title>
          </metadata>
          <manifest>
            <item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image" />
          </manifest>
        </package>`,
      "OEBPS/images/cover.jpg": FAKE_COVER,
    });

    const result = await extractEpubCover(epubPath);
    expect(result).toEqual({ buffer: FAKE_COVER, mediaType: "image/jpeg" });
  });

  it("returns null when manifest is missing entirely", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="content.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
      "content.opf": `<?xml version="1.0" encoding="utf-8"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>No Manifest</dc:title>
          </metadata>
        </package>`,
    });

    const result = await extractEpubCover(epubPath);
    expect(result).toBeNull();
  });

  it("covers readZipEntryBuffer error for missing entry", async () => {
    const epubPath = await createEpub({
      "META-INF/container.xml": `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="content.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
      "content.opf": `<?xml version="1.0" encoding="utf-8"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Missing Cover File</dc:title>
          </metadata>
          <manifest>
            <item id="cover" href="missing.png" media-type="image/png" properties="cover-image" />
          </manifest>
        </package>`,
    });

    await expect(extractEpubCover(epubPath)).rejects.toThrow('EPUB entry "missing.png" was not found');
  });

  it("covers getManifestCoverHref internal edge cases", () => {
    // No manifest in package
    expect(EPUB_INTERNALS.getManifestCoverHref(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf">
        <metadata><title>Test</title></metadata>
      </package>`)).toBeNull();

    // EPUB 3 with cover-image property
    expect(EPUB_INTERNALS.getManifestCoverHref(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf">
        <metadata />
        <manifest>
          <item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image" />
        </manifest>
      </package>`)).toEqual({ href: "cover.jpg", mediaType: "image/jpeg" });

    // EPUB 2 meta name="cover" fallback
    expect(EPUB_INTERNALS.getManifestCoverHref(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf">
        <metadata>
          <meta name="cover" content="img-cover" />
        </metadata>
        <manifest>
          <item id="img-cover" href="images/cover.png" media-type="image/png" />
        </manifest>
      </package>`)).toEqual({ href: "images/cover.png", mediaType: "image/png" });

    // EPUB 2 meta but no matching manifest item
    expect(EPUB_INTERNALS.getManifestCoverHref(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf">
        <metadata>
          <meta name="cover" content="nonexistent-id" />
        </metadata>
        <manifest>
          <item id="other" href="other.xhtml" media-type="application/xhtml+xml" />
        </manifest>
      </package>`)).toBeNull();

    // Manifest items without properties or cover meta
    expect(EPUB_INTERNALS.getManifestCoverHref(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf">
        <metadata />
        <manifest>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" />
        </manifest>
      </package>`)).toBeNull();

    // Single manifest item (not an array)
    expect(EPUB_INTERNALS.getManifestCoverHref(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf">
        <metadata />
        <manifest>
          <item id="cover" href="c.jpg" media-type="image/jpeg" properties="cover-image" />
        </manifest>
      </package>`)).toEqual({ href: "c.jpg", mediaType: "image/jpeg" });

    // Metadata with non-cover meta entries (EPUB 2 loop runs but no match)
    expect(EPUB_INTERNALS.getManifestCoverHref(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf">
        <metadata>
          <meta name="generator" content="calibre" />
        </metadata>
        <manifest>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" />
        </manifest>
      </package>`)).toBeNull();

    // Manifest with items but no metadata element (EPUB 2 fallback can't run)
    expect(EPUB_INTERNALS.getManifestCoverHref(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf">
        <manifest>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" />
        </manifest>
      </package>`)).toBeNull();
  });

  it("covers readZipEntryBuffer for missing file", async () => {
    await expect(
      EPUB_INTERNALS.readZipEntryBuffer("/definitely/missing.epub", "cover.png"),
    ).rejects.toThrow();
  });
});
