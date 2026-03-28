import { describe, it, expect } from "vitest";
import {
  searchOpenLibrary,
  getOpenLibraryEdition,
  getOpenLibraryWork,
  searchOpenLibraryAuthors,
  createOLFetcher,
} from "./open-library";

function fakeFetch(body: object | string | null, status = 200): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })) as object as typeof fetch;
}

describe("searchOpenLibrary", () => {
  it("returns structured results from OL search API", async () => {
    const body = {
      docs: [
        {
          key: "/works/OL123W",
          title: "The Hobbit",
          author_name: ["J.R.R. Tolkien"],
          first_publish_year: 1937,
          isbn: ["978-0547928227"],
          cover_i: 42,
        },
      ],
    };
    const results = await searchOpenLibrary("The Hobbit", "Tolkien", fakeFetch(body));
    expect(results).toEqual([
      {
        olid: "OL123W",
        title: "The Hobbit",
        authors: ["J.R.R. Tolkien"],
        firstPublishYear: 1937,
        isbns: ["978-0547928227"],
        coverId: 42,
      },
    ]);
  });

  it("handles missing optional fields", async () => {
    const body = {
      docs: [
        {
          key: "/works/OL456W",
          title: "Unknown Book",
        },
      ],
    };
    const results = await searchOpenLibrary("Unknown", undefined, fakeFetch(body));
    expect(results).toEqual([
      {
        olid: "OL456W",
        title: "Unknown Book",
        authors: [],
        firstPublishYear: null,
        isbns: [],
        coverId: null,
      },
    ]);
  });

  it("returns empty array when no docs found", async () => {
    const results = await searchOpenLibrary("zzz", undefined, fakeFetch({ docs: [] }));
    expect(results).toEqual([]);
  });

  it("returns null on 404", async () => {
    const results = await searchOpenLibrary("zzz", undefined, fakeFetch({}, 404));
    expect(results).toBeNull();
  });

  it("throws on network error", async () => {
    const errorFetch = (() => Promise.reject(new Error("network down"))) as object as typeof fetch;
    await expect(searchOpenLibrary("test", undefined, errorFetch)).rejects.toThrow("network down");
  });

  it("throws on non-404 error status", async () => {
    await expect(searchOpenLibrary("test", undefined, fakeFetch({}, 500))).rejects.toThrow("Open Library API error: 500");
  });

  it("encodes query parameters", async () => {
    let calledUrl = "";
    const captureFetch = ((url: string) => {
      calledUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ docs: [] }),
      });
    }) as object as typeof fetch;

    await searchOpenLibrary("War & Peace", "Tolstoy", captureFetch);
    expect(calledUrl).toContain("War+%26+Peace");
    expect(calledUrl).toContain("author=Tolstoy");
  });
});

describe("getOpenLibraryEdition", () => {
  it("returns edition data by ISBN", async () => {
    const body = {
      key: "/books/OL789M",
      title: "The Hobbit",
      publishers: ["Houghton Mifflin"],
      publish_date: "September 21, 1937",
      number_of_pages: 310,
      covers: [42],
      works: [{ key: "/works/OL123W" }],
    };
    const edition = await getOpenLibraryEdition("978-0547928227", fakeFetch(body));
    expect(edition).toEqual({
      olid: "OL789M",
      title: "The Hobbit",
      publishers: ["Houghton Mifflin"],
      publishDate: "September 21, 1937",
      pageCount: 310,
      coverIds: [42],
      workOlid: "OL123W",
    });
  });

  it("handles missing optional fields", async () => {
    const body = {
      key: "/books/OL111M",
      title: "Minimal",
      works: [{ key: "/works/OL222W" }],
    };
    const edition = await getOpenLibraryEdition("1234567890", fakeFetch(body));
    expect(edition).toEqual({
      olid: "OL111M",
      title: "Minimal",
      publishers: [],
      publishDate: null,
      pageCount: null,
      coverIds: [],
      workOlid: "OL222W",
    });
  });

  it("handles missing works field", async () => {
    const body = {
      key: "/books/OL333M",
      title: "No Works",
    };
    const edition = await getOpenLibraryEdition("1111111111", fakeFetch(body));
    expect(edition?.workOlid).toBe("");
  });

  it("returns null on 404", async () => {
    const edition = await getOpenLibraryEdition("0000000000", fakeFetch({}, 404));
    expect(edition).toBeNull();
  });

  it("throws on non-404 error status", async () => {
    await expect(getOpenLibraryEdition("123", fakeFetch({}, 500))).rejects.toThrow("Open Library API error: 500");
  });

  it("throws on network error", async () => {
    const errorFetch = (() => Promise.reject(new Error("timeout"))) as object as typeof fetch;
    await expect(getOpenLibraryEdition("123", errorFetch)).rejects.toThrow("timeout");
  });
});

describe("getOpenLibraryWork", () => {
  it("returns work data by OLID", async () => {
    const body = {
      key: "/works/OL123W",
      title: "The Hobbit",
      description: "A hobbit goes on an adventure",
      covers: [42, 99],
      subjects: ["Fantasy", "Adventure"],
    };
    const work = await getOpenLibraryWork("OL123W", fakeFetch(body));
    expect(work).toEqual({
      olid: "OL123W",
      title: "The Hobbit",
      description: "A hobbit goes on an adventure",
      coverIds: [42, 99],
      subjects: ["Fantasy", "Adventure"],
    });
  });

  it("handles description as object with value", async () => {
    const body = {
      key: "/works/OL123W",
      title: "The Hobbit",
      description: { type: "/type/text", value: "A hobbit goes on an adventure" },
      covers: [],
      subjects: [],
    };
    const work = await getOpenLibraryWork("OL123W", fakeFetch(body));
    expect(work?.description).toBe("A hobbit goes on an adventure");
  });

  it("handles missing optional fields", async () => {
    const body = {
      key: "/works/OL999W",
      title: "Bare Bones",
    };
    const work = await getOpenLibraryWork("OL999W", fakeFetch(body));
    expect(work).toEqual({
      olid: "OL999W",
      title: "Bare Bones",
      description: null,
      coverIds: [],
      subjects: [],
    });
  });

  it("returns null on 404", async () => {
    const work = await getOpenLibraryWork("OL000W", fakeFetch({}, 404));
    expect(work).toBeNull();
  });

  it("throws on non-404 error status", async () => {
    await expect(getOpenLibraryWork("OL000W", fakeFetch({}, 500))).rejects.toThrow("Open Library API error: 500");
  });

  it("throws on network error", async () => {
    const errorFetch = (() => Promise.reject(new Error("dns fail"))) as object as typeof fetch;
    await expect(getOpenLibraryWork("OL000W", errorFetch)).rejects.toThrow("dns fail");
  });
});

describe("searchOpenLibraryAuthors", () => {
  it("returns structured results from OL authors search API", async () => {
    const body = {
      docs: [
        {
          key: "OL34184A",
          name: "J.R.R. Tolkien",
          work_count: 200,
          top_subjects: ["Fantasy fiction", "Adventure"],
        },
      ],
    };
    const results = await searchOpenLibraryAuthors("Tolkien", fakeFetch(body));
    expect(results).toEqual([
      {
        olid: "OL34184A",
        name: "J.R.R. Tolkien",
        workCount: 200,
      },
    ]);
  });

  it("handles missing optional fields", async () => {
    const body = {
      docs: [
        {
          key: "OL555A",
          name: "Unknown Author",
        },
      ],
    };
    const results = await searchOpenLibraryAuthors("Unknown", fakeFetch(body));
    expect(results).toEqual([
      {
        olid: "OL555A",
        name: "Unknown Author",
        workCount: 0,
      },
    ]);
  });

  it("returns empty array when no docs found", async () => {
    const results = await searchOpenLibraryAuthors("zzz", fakeFetch({ docs: [] }));
    expect(results).toEqual([]);
  });

  it("returns null on 404", async () => {
    const results = await searchOpenLibraryAuthors("zzz", fakeFetch({}, 404));
    expect(results).toBeNull();
  });

  it("throws on non-404 error status", async () => {
    await expect(searchOpenLibraryAuthors("test", fakeFetch({}, 500))).rejects.toThrow("Open Library API error: 500");
  });

  it("throws on network error", async () => {
    const errorFetch = (() => Promise.reject(new Error("network down"))) as object as typeof fetch;
    await expect(searchOpenLibraryAuthors("test", errorFetch)).rejects.toThrow("network down");
  });

  it("encodes query parameters", async () => {
    let calledUrl = "";
    const captureFetch = ((url: string) => {
      calledUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ docs: [] }),
      });
    }) as object as typeof fetch;

    await searchOpenLibraryAuthors("O'Brien", captureFetch);
    expect(calledUrl).toContain("search/authors.json");
    expect(calledUrl).toContain("q=O");
  });
});

describe("createOLFetcher", () => {
  it("adds User-Agent header with app name and contact email", async () => {
    let capturedInit: RequestInit | undefined;
    const baseFetch = ((_url: string, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ docs: [] }),
      });
    }) as object as typeof fetch;

    const olFetch = createOLFetcher("test@example.com", baseFetch);
    await olFetch("https://openlibrary.org/search.json?title=test");

    expect(capturedInit).toBeDefined();
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("Bookhouse (test@example.com)");
  });

  it("preserves existing init options", async () => {
    let capturedInit: RequestInit | undefined;
    const baseFetch = ((_url: string, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    }) as object as typeof fetch;

    const olFetch = createOLFetcher("test@example.com", baseFetch);
    await olFetch("https://openlibrary.org/test", { method: "POST" });

    expect(capturedInit?.method).toBe("POST");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("Bookhouse (test@example.com)");
  });
});
