import { describe, it, expect, vi } from "vitest";
import { searchGoogleBooks, getGoogleBooksVolume, type GBVolume } from "./google-books";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

const sampleVolumeInfo = {
  title: "Dune",
  authors: ["Frank Herbert"],
  publisher: "Chilton Books",
  publishedDate: "1965",
  description: "A science fiction epic",
  pageCount: 412,
  categories: ["Fiction / Science Fiction"],
  imageLinks: { thumbnail: "https://books.google.com/thumb.jpg", smallThumbnail: "https://books.google.com/small.jpg" },
  industryIdentifiers: [
    { type: "ISBN_13", identifier: "9780441172719" },
    { type: "ISBN_10", identifier: "0441172717" },
  ],
};

const sampleItem = {
  id: "vol_abc123",
  volumeInfo: sampleVolumeInfo,
};

describe("searchGoogleBooks", () => {
  it("returns parsed volumes from search results", async () => {
    const fetcher = fakeFetch({ kind: "books#volumes", totalItems: 1, items: [sampleItem] });

    const results = await searchGoogleBooks("Dune", "Frank Herbert", "test-key", fetcher);

    expect(results).toHaveLength(1);
    const vol = (results as GBVolume[])[0] as GBVolume;
    expect(vol.googleBooksId).toBe("vol_abc123");
    expect(vol.title).toBe("Dune");
    expect(vol.authors).toEqual(["Frank Herbert"]);
    expect(vol.publisher).toBe("Chilton Books");
    expect(vol.publishedDate).toBe("1965");
    expect(vol.description).toBe("A science fiction epic");
    expect(vol.pageCount).toBe(412);
    expect(vol.categories).toEqual(["Fiction / Science Fiction"]);
    expect(vol.isbn13).toBe("9780441172719");
    expect(vol.isbn10).toBe("0441172717");
    expect(vol.thumbnailUrl).toBe("https://books.google.com/thumb.jpg");
  });

  it("builds correct URL with title and author", async () => {
    const fetcher = fakeFetch({ totalItems: 0, items: [] });

    await searchGoogleBooks("The Hobbit", "Tolkien", "my-key", fetcher);

    const url = ((fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain("intitle%3AThe+Hobbit");
    expect(url).toContain("inauthor%3ATolkien");
    expect(url).toContain("key=my-key");
    expect(url).toContain("maxResults=5");
  });

  it("builds URL without author when not provided", async () => {
    const fetcher = fakeFetch({ totalItems: 0, items: [] });

    await searchGoogleBooks("Dune", undefined, "key", fetcher);

    const url = ((fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain("intitle%3ADune");
    expect(url).not.toContain("inauthor%3A");
  });

  it("returns null on 404", async () => {
    const fetcher = fakeFetch(null, 404);

    const result = await searchGoogleBooks("Missing", undefined, "key", fetcher);

    expect(result).toBeNull();
  });

  it("throws on non-404 error", async () => {
    const fetcher = fakeFetch(null, 500);

    await expect(searchGoogleBooks("Error", undefined, "key", fetcher)).rejects.toThrow(
      "Google Books API error: 500",
    );
  });

  it("returns empty array when totalItems is 0", async () => {
    const fetcher = fakeFetch({ totalItems: 0 });

    const result = await searchGoogleBooks("Nothing", undefined, "key", fetcher);

    expect(result).toEqual([]);
  });

  it("handles missing optional fields gracefully", async () => {
    const fetcher = fakeFetch({
      totalItems: 1,
      items: [{ id: "vol_minimal", volumeInfo: { title: "Minimal" } }],
    });

    const results = await searchGoogleBooks("Minimal", undefined, "key", fetcher);

    const vol = (results as GBVolume[])[0] as GBVolume;
    expect(vol.googleBooksId).toBe("vol_minimal");
    expect(vol.title).toBe("Minimal");
    expect(vol.authors).toEqual([]);
    expect(vol.publisher).toBeNull();
    expect(vol.publishedDate).toBeNull();
    expect(vol.description).toBeNull();
    expect(vol.pageCount).toBeNull();
    expect(vol.categories).toEqual([]);
    expect(vol.isbn13).toBeNull();
    expect(vol.isbn10).toBeNull();
    expect(vol.thumbnailUrl).toBeNull();
  });

  it("handles item with no volumeInfo", async () => {
    const fetcher = fakeFetch({
      totalItems: 1,
      items: [{ id: "vol_bare" }],
    });

    const results = await searchGoogleBooks("Bare", undefined, "key", fetcher);

    const vol = (results as GBVolume[])[0] as GBVolume;
    expect(vol.googleBooksId).toBe("vol_bare");
    expect(vol.title).toBe("");
    expect(vol.subtitle).toBeNull();
  });

  it("includes subtitle when present", async () => {
    const fetcher = fakeFetch({
      totalItems: 1,
      items: [{
        id: "vol_sub",
        volumeInfo: { title: "Dune", subtitle: "A Novel" },
      }],
    });

    const results = await searchGoogleBooks("Dune", undefined, "key", fetcher);

    const vol = (results as GBVolume[])[0] as GBVolume;
    expect(vol.subtitle).toBe("A Novel");
  });

  it("extracts ISBNs correctly from industryIdentifiers", async () => {
    const fetcher = fakeFetch({
      totalItems: 1,
      items: [{
        id: "vol_isbn",
        volumeInfo: {
          title: "ISBNs",
          industryIdentifiers: [
            { type: "OTHER", identifier: "OCLC:12345" },
            { type: "ISBN_10", identifier: "0123456789" },
          ],
        },
      }],
    });

    const results = await searchGoogleBooks("ISBNs", undefined, "key", fetcher);

    const vol = (results as GBVolume[])[0] as GBVolume;
    expect(vol.isbn13).toBeNull();
    expect(vol.isbn10).toBe("0123456789");
  });
});

describe("getGoogleBooksVolume", () => {
  it("returns a single volume by ID", async () => {
    const fetcher = fakeFetch({ id: "vol_abc123", volumeInfo: sampleVolumeInfo });

    const vol = await getGoogleBooksVolume("vol_abc123", "test-key", fetcher);

    expect(vol).not.toBeNull();
    const volume = vol as GBVolume;
    expect(volume.googleBooksId).toBe("vol_abc123");
    expect(volume.title).toBe("Dune");
  });

  it("builds correct URL", async () => {
    const fetcher = fakeFetch({ id: "x", volumeInfo: { title: "T" } });

    await getGoogleBooksVolume("vol_xyz", "my-key", fetcher);

    const url = ((fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain("/volumes/vol_xyz");
    expect(url).toContain("key=my-key");
  });

  it("returns null on 404", async () => {
    const fetcher = fakeFetch(null, 404);

    const result = await getGoogleBooksVolume("missing", "key", fetcher);

    expect(result).toBeNull();
  });

  it("throws on non-404 error", async () => {
    const fetcher = fakeFetch(null, 500);

    await expect(getGoogleBooksVolume("err", "key", fetcher)).rejects.toThrow(
      "Google Books API error: 500",
    );
  });
});
