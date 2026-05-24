import { describe, expect, it, vi } from "vitest";
import { parseOpfXml } from "./opf";
import {
  buildAudiobookMetadataJson,
  buildOpfXml,
  writeAudiobookMetadataJson,
  writeCoverJpeg,
  writeOpfSidecar,
} from "./sidecar-writer";

describe("buildAudiobookMetadataJson", () => {
  it("serialises the audiobook metadata in the shape parseAudiobookMetadataJson expects", () => {
    const json = buildAudiobookMetadataJson({
      title: "Mistborn: The Final Empire",
      subtitle: "Book One",
      authors: ["Brandon Sanderson"],
      narrators: ["Michael Kramer"],
      series: [{ name: "Mistborn Era 1", sequence: "1" }],
      publisher: "Macmillan Audio",
      publishedYear: "2006",
      description: "A young thief discovers she has magical powers.",
      genres: ["Fantasy", "Adventure"],
      language: "en",
      isbn: "9781427201881",
      asin: "B002UZJK1U",
    });

    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.title).toBe("Mistborn: The Final Empire");
    expect(parsed.authors).toEqual(["Brandon Sanderson"]);
    expect(parsed.narrators).toEqual(["Michael Kramer"]);
    expect(parsed.series).toEqual([{ name: "Mistborn Era 1", sequence: "1" }]);
    expect(parsed.publisher).toBe("Macmillan Audio");
    expect(parsed.publishedYear).toBe("2006");
    expect(parsed.isbn).toBe("9781427201881");
    expect(parsed.asin).toBe("B002UZJK1U");
    expect(parsed.genres).toEqual(["Fantasy", "Adventure"]);
  });

  it("omits undefined optional fields", () => {
    const json = buildAudiobookMetadataJson({
      title: "Simple Book",
      authors: ["Some Author"],
      narrators: [],
      series: [],
      genres: [],
    });

    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.title).toBe("Simple Book");
    expect("subtitle" in parsed).toBe(false);
    expect("publisher" in parsed).toBe(false);
    expect("isbn" in parsed).toBe(false);
    expect(parsed.narrators).toEqual([]);
  });

  it("pretty-prints the JSON for human readability", () => {
    const json = buildAudiobookMetadataJson({
      title: "Title",
      authors: ["Author"],
      narrators: [],
      series: [],
      genres: [],
    });
    expect(json).toContain("\n");
    expect(json.endsWith("\n")).toBe(true);
  });
});

describe("writeAudiobookMetadataJson", () => {
  it("writes metadata.json to the target directory", async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await writeAudiobookMetadataJson(
      "/data/audiobooks/Author/Title",
      {
        title: "Title",
        authors: ["Author"],
        narrators: [],
        series: [],
        genres: [],
      },
      { mkdir, writeFile },
    );

    expect(mkdir).toHaveBeenCalledWith("/data/audiobooks/Author/Title", {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [filePath, contents] = writeFile.mock.calls[0]!;
    expect(filePath).toBe("/data/audiobooks/Author/Title/metadata.json");
    expect(typeof contents).toBe("string");
    expect(JSON.parse(contents as string).title).toBe("Title");
  });
});

describe("buildOpfXml", () => {
  it("produces an OPF document that round-trips through parseOpfXml", () => {
    const xml = buildOpfXml({
      title: "Mistborn: The Final Empire",
      authors: [{ name: "Brandon Sanderson", fileAs: "Sanderson, Brandon" }],
      identifiers: [{ scheme: "ISBN", value: "9780765311788" }],
      description: "A young thief discovers she has magical powers.",
      subjects: ["Fantasy", "Adventure"],
      publisher: "Tor Books",
      date: "2006-07-17",
      language: "en",
      series: { name: "Mistborn", index: 1 },
    });

    const parsed = parseOpfXml(xml);
    expect(parsed.title).toBe("Mistborn: The Final Empire");
    expect(parsed.authors).toHaveLength(1);
    expect(parsed.authors[0]!.name).toBe("Brandon Sanderson");
    expect(parsed.authors[0]!.fileAs).toBe("Sanderson, Brandon");
    expect(parsed.identifiers).toEqual([
      { scheme: "ISBN", value: "9780765311788" },
    ]);
    expect(parsed.description).toBe(
      "A young thief discovers she has magical powers.",
    );
    expect(parsed.subjects).toEqual(["Fantasy", "Adventure"]);
    expect(parsed.publisher).toBe("Tor Books");
    expect(parsed.date).toBe("2006-07-17");
    expect(parsed.language).toBe("en");
    expect(parsed.series).toEqual({ name: "Mistborn", index: 1 });
  });

  it("escapes XML special characters in text content", () => {
    const xml = buildOpfXml({
      title: 'Foo & "Bar" <baz>',
      authors: [{ name: "O'Brien & Sons" }],
      identifiers: [],
      subjects: [],
    });

    const parsed = parseOpfXml(xml);
    expect(parsed.title).toBe('Foo & "Bar" <baz>');
    expect(parsed.authors[0]!.name).toBe("O'Brien & Sons");
  });

  it("supports multiple authors and identifiers", () => {
    const xml = buildOpfXml({
      title: "Anthology",
      authors: [
        { name: "Author One" },
        { name: "Author Two", fileAs: "Two, Author" },
      ],
      identifiers: [
        { scheme: "ISBN", value: "9781234567897" },
        { scheme: "ASIN", value: "B000ABCD12" },
      ],
      subjects: [],
    });

    const parsed = parseOpfXml(xml);
    expect(parsed.authors).toHaveLength(2);
    expect(parsed.authors.map((a) => a.name)).toEqual([
      "Author One",
      "Author Two",
    ]);
    expect(parsed.identifiers).toHaveLength(2);
    expect(parsed.identifiers.map((i) => i.scheme)).toEqual(["ISBN", "ASIN"]);
  });

  it("omits optional elements when undefined", () => {
    const xml = buildOpfXml({
      title: "Minimal Book",
      authors: [{ name: "Some Author" }],
      identifiers: [],
      subjects: [],
    });

    expect(xml).not.toContain("<dc:description>");
    expect(xml).not.toContain("<dc:publisher>");
    expect(xml).not.toContain("calibre:series");
  });

  it("writes series with no index when index is undefined", () => {
    const xml = buildOpfXml({
      title: "Book",
      authors: [{ name: "Author" }],
      identifiers: [],
      subjects: [],
      series: { name: "Saga" },
    });

    const parsed = parseOpfXml(xml);
    expect(parsed.series).toEqual({ name: "Saga", index: undefined });
  });

  it("omits the title element when title is undefined", () => {
    const xml = buildOpfXml({
      authors: [{ name: "Author" }],
      identifiers: [],
      subjects: [],
    });
    expect(xml).not.toContain("<dc:title>");
  });

  it("writes identifiers without scheme attribute when scheme is undefined", () => {
    const xml = buildOpfXml({
      title: "Book",
      authors: [{ name: "Author" }],
      identifiers: [{ value: "urn:uuid:abc" }],
      subjects: [],
    });
    expect(xml).toContain("<dc:identifier>urn:uuid:abc</dc:identifier>");
    expect(xml).not.toContain('opf:scheme=""');
  });

  it("emits opf:role on authors when supplied", () => {
    const xml = buildOpfXml({
      title: "Book",
      authors: [{ name: "Editor Name", role: "edt" }],
      identifiers: [],
      subjects: [],
    });
    expect(xml).toContain('opf:role="edt"');
    const parsed = parseOpfXml(xml);
    expect(parsed.authors[0]!.role).toBe("edt");
  });
});

describe("writeOpfSidecar", () => {
  it("writes metadata.opf to the target directory", async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await writeOpfSidecar(
      "/data/ebooks/Author/Title",
      {
        title: "Title",
        authors: [{ name: "Author" }],
        identifiers: [],
        subjects: [],
      },
      { mkdir, writeFile },
    );

    expect(mkdir).toHaveBeenCalledWith("/data/ebooks/Author/Title", {
      recursive: true,
    });
    const [filePath, contents] = writeFile.mock.calls[0]!;
    expect(filePath).toBe("/data/ebooks/Author/Title/metadata.opf");
    expect(typeof contents).toBe("string");
    expect(contents as string).toContain("<dc:title>Title</dc:title>");
  });
});

describe("writeCoverJpeg", () => {
  it("converts input to JPEG via sharp and writes cover.jpg", async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const toBuffer = vi.fn().mockResolvedValue(Buffer.from("jpeg-bytes"));
    const jpeg = vi.fn().mockReturnValue({ toBuffer });
    const sharpFn = vi.fn().mockReturnValue({ jpeg });

    await writeCoverJpeg(
      "/data/ebooks/Author/Title",
      Buffer.from("png-bytes"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { mkdir, writeFile, sharp: sharpFn as any },
    );

    expect(mkdir).toHaveBeenCalledWith("/data/ebooks/Author/Title", {
      recursive: true,
    });
    expect(sharpFn).toHaveBeenCalledWith(Buffer.from("png-bytes"));
    expect(jpeg).toHaveBeenCalledWith(expect.objectContaining({ quality: expect.any(Number) }));
    const [coverPath, coverBytes] = writeFile.mock.calls[0]!;
    expect(coverPath).toBe("/data/ebooks/Author/Title/cover.jpg");
    expect(coverBytes).toEqual(Buffer.from("jpeg-bytes"));
  });
});
