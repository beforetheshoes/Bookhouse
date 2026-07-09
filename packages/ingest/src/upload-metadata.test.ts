import { createWriteStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import yazl from "yazl";
import { afterEach, describe, expect, it } from "vitest";
import { MediaKind } from "@bookhouse/domain";
import { buildOpfXml, deriveUploadMetadata } from "./index";
import type { UploadFileForDerivation } from "./upload-metadata";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { force: true, recursive: true })));
  tempDirectories.length = 0;
});

async function makeTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-upload-meta-"));
  tempDirectories.push(directory);
  return directory;
}

async function createEpub(directory: string, entries: Record<string, string>): Promise<string> {
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

function epubEntries(opfMetadata: string): Record<string, string> {
  return {
    "META-INF/container.xml": `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="content.opf" media-type="application/oebps-package+xml" />
        </rootfiles>
      </container>`,
    "content.opf": `<?xml version="1.0" encoding="utf-8"?>
      <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          ${opfMetadata}
        </metadata>
      </package>`,
  };
}

function file(basename: string, mediaKind: MediaKind, stagingPath: string): UploadFileForDerivation {
  return { basename, mediaKind, stagingPath };
}

describe("deriveUploadMetadata", () => {
  it("derives everything from an uploaded metadata.opf sidecar", async () => {
    const dir = await makeTempDir();
    const opfPath = path.join(dir, "metadata.opf");
    await writeFile(opfPath, buildOpfXml({
      title: "The Fifth Season",
      authors: [{ name: "N. K. Jemisin" }],
      identifiers: [],
      description: "The season to end all seasons.",
      subjects: [],
      series: { name: "The Broken Earth", index: 1 },
    }));

    const derived = await deriveUploadMetadata([
      file("book.epub", MediaKind.EPUB, path.join(dir, "missing.epub")),
      file("metadata.opf", MediaKind.SIDECAR, opfPath),
    ]);

    expect(derived).toEqual({
      title: "The Fifth Season",
      author: "N. K. Jemisin",
      series: "The Broken Earth",
      seriesIndex: "1",
      description: "The season to end all seasons.",
    });
  });

  it("derives from an uploaded metadata.json audiobook sidecar", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "metadata.json");
    await writeFile(jsonPath, JSON.stringify({
      title: "Project Hail Mary",
      authors: ["Andy Weir"],
      narrators: ["Ray Porter"],
      series: [{ name: "Standalone", sequence: "2" }],
      genres: [],
      description: "An astronaut wakes up alone.",
    }));

    const derived = await deriveUploadMetadata([
      file("01.mp3", MediaKind.AUDIO, path.join(dir, "01.mp3")),
      file("metadata.json", MediaKind.SIDECAR, jsonPath),
    ]);

    expect(derived).toEqual({
      title: "Project Hail Mary",
      author: "Andy Weir",
      series: "Standalone",
      seriesIndex: "2",
      description: "An astronaut wakes up alone.",
    });
  });

  it("derives title and author from EPUB metadata when no sidecar is present", async () => {
    const dir = await makeTempDir();
    const epubPath = await createEpub(dir, epubEntries(`
      <dc:title>The Obelisk Gate</dc:title>
      <dc:creator>N. K. Jemisin</dc:creator>
    `));

    const derived = await deriveUploadMetadata([
      file("book.epub", MediaKind.EPUB, epubPath),
    ]);

    expect(derived).toEqual({
      title: "The Obelisk Gate",
      author: "N. K. Jemisin",
    });
  });

  it("merges fields across sources: sidecar title, epub author", async () => {
    const dir = await makeTempDir();
    const opfPath = path.join(dir, "metadata.opf");
    await writeFile(opfPath, buildOpfXml({
      title: "Sidecar Title",
      authors: [],
      identifiers: [],
      subjects: [],
    }));
    const epubPath = await createEpub(dir, epubEntries(`
      <dc:title>Epub Title</dc:title>
      <dc:creator>Epub Author</dc:creator>
    `));

    const derived = await deriveUploadMetadata([
      file("book.epub", MediaKind.EPUB, epubPath),
      file("metadata.opf", MediaKind.SIDECAR, opfPath),
    ]);

    expect(derived.title).toBe("Sidecar Title");
    expect(derived.author).toBe("Epub Author");
  });

  it("derives title and author from audio tags", async () => {
    const derived = await deriveUploadMetadata(
      [file("chapter-01.mp3", MediaKind.AUDIO, "/nowhere/chapter-01.mp3")],
      {
        parseAudioId3Tags: () => Promise.resolve({
          tags: {
            title: "Chapter 1",
            artist: "Andy Weir",
            albumArtist: "Andy Weir (author)",
            album: "Project Hail Mary",
            genres: [],
          },
          warnings: [],
        }),
      },
    );

    expect(derived).toEqual({
      title: "Project Hail Mary",
      author: "Andy Weir (author)",
    });
  });

  it("falls back to track title and artist when album tags are missing", async () => {
    const derived = await deriveUploadMetadata(
      [file("book.m4b", MediaKind.AUDIO, "/nowhere/book.m4b")],
      {
        parseAudioId3Tags: () => Promise.resolve({
          tags: { title: "Whole Book", artist: "Solo Artist", genres: [] },
          warnings: [],
        }),
      },
    );

    expect(derived).toEqual({ title: "Whole Book", author: "Solo Artist" });
  });

  it("falls back to a filename-derived title when nothing else is available", async () => {
    const dir = await makeTempDir();
    const pdfPath = path.join(dir, "The_Great_Book.pdf");
    await writeFile(pdfPath, "%PDF-1.4 not really");

    const derived = await deriveUploadMetadata([
      file("The_Great_Book.pdf", MediaKind.PDF, pdfPath),
    ]);

    expect(derived).toEqual({ title: "The Great Book" });
  });

  it("skips unreadable sources instead of failing", async () => {
    const dir = await makeTempDir();
    const corruptEpub = path.join(dir, "corrupt.epub");
    await writeFile(corruptEpub, "not a zip at all");
    const corruptJson = path.join(dir, "metadata.json");
    await writeFile(corruptJson, "{not json");

    const derived = await deriveUploadMetadata([
      file("corrupt.epub", MediaKind.EPUB, corruptEpub),
      file("metadata.opf", MediaKind.SIDECAR, path.join(dir, "missing.opf")),
      file("metadata.json", MediaKind.SIDECAR, corruptJson),
    ]);

    expect(derived).toEqual({ title: "corrupt" });
  });

  it("survives real audio files with unreadable tags via the filename fallback", async () => {
    const dir = await makeTempDir();
    const fakeAudio = path.join(dir, "Fake_Audiobook.m4b");
    await writeFile(fakeAudio, "not actually audio");

    const derived = await deriveUploadMetadata([
      file("Fake_Audiobook.m4b", MediaKind.AUDIO, fakeAudio),
    ]);

    expect(derived).toEqual({ title: "Fake Audiobook" });
  });

  it("ignores whitespace-only values from sources", async () => {
    const dir = await makeTempDir();
    const epubPath = await createEpub(dir, epubEntries(`
      <dc:title> </dc:title>
      <dc:creator>Real Author</dc:creator>
    `));

    const derived = await deriveUploadMetadata([
      file("Named_By_File.epub", MediaKind.EPUB, epubPath),
    ]);

    expect(derived).toEqual({ title: "Named By File", author: "Real Author" });
  });

  it("returns an empty result when there are no content files", async () => {
    const derived = await deriveUploadMetadata([]);
    expect(derived).toEqual({});
  });
});
