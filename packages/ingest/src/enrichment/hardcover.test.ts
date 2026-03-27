import { describe, it, expect, vi } from "vitest";
import { searchHardcover, getHardcoverBook, type HCBook } from "./hardcover";

function fakeFetch(body: object | string | null, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  }) as object as typeof fetch;
}

const sampleSearchResult = {
  id: 42,
  title: "Dune",
  description: "A science fiction novel",
  image: { url: "https://hardcover.app/covers/dune.jpg" },
  author_names: ["Frank Herbert"],
  cached_tags: [{ tag: "Science Fiction" }, { tag: "Epic" }],
  cached_image: { url: "https://hardcover.app/cached/dune.jpg" },
};

const sampleDetailBook = {
  id: 42,
  title: "Dune",
  description: "A science fiction novel",
  image: { url: "https://hardcover.app/covers/dune.jpg" },
  contributions: [{ author: { name: "Frank Herbert" } }],
  taggings: [{ tag: { tag: "Science Fiction" } }, { tag: { tag: "Epic" } }],
  editions: [{
    isbn_13: "9780441172719",
    publishers: [{ publisher: { name: "Chilton Books" } }],
    release_date: "1965-08-01",
    pages: 412,
  }],
};

describe("searchHardcover", () => {
  it("returns parsed books from search results array", async () => {
    const fetcher = fakeFetch({
      data: { search: { results: [sampleSearchResult] } },
    });

    const results = await searchHardcover("Dune", "Frank Herbert", "api-key", fetcher);

    expect(results).toHaveLength(1);
    const book = (results as HCBook[])[0] as HCBook;
    expect(book.hardcoverId).toBe("42");
    expect(book.title).toBe("Dune");
    expect(book.description).toBe("A science fiction novel");
    expect(book.authors).toEqual(["Frank Herbert"]);
    expect(book.imageUrl).toBe("https://hardcover.app/cached/dune.jpg");
    expect(book.categories).toEqual(["Science Fiction", "Epic"]);
    // Search hits don't include edition details
    expect(book.publisher).toBeNull();
    expect(book.isbn13).toBeNull();
  });

  it("parses results when returned as JSON string array", async () => {
    const fetcher = fakeFetch({
      data: { search: { results: JSON.stringify([sampleSearchResult]) } },
    });

    const results = await searchHardcover("Dune", undefined, "key", fetcher);

    expect(results).toHaveLength(1);
    expect((results as HCBook[])[0]?.title).toBe("Dune");
  });

  it("parses results when returned as JSON string Typesense object", async () => {
    const fetcher = fakeFetch({
      data: { search: { results: JSON.stringify({ found: 1, hits: [{ document: sampleSearchResult }] }) } },
    });

    const results = await searchHardcover("Dune", undefined, "key", fetcher);

    expect(results).toHaveLength(1);
    expect((results as HCBook[])[0]?.title).toBe("Dune");
  });

  it("falls back to image.url when cached_image is missing", async () => {
    const hit = { ...sampleSearchResult, cached_image: undefined };
    const fetcher = fakeFetch({ data: { search: { results: [hit] } } });

    const results = await searchHardcover("Dune", undefined, "key", fetcher);

    expect((results as HCBook[])[0]?.imageUrl).toBe("https://hardcover.app/covers/dune.jpg");
  });

  it("sends correct GraphQL query with title and author", async () => {
    const fetcher = fakeFetch({ data: { search: { results: [] } } });

    await searchHardcover("The Hobbit", "Tolkien", "key", fetcher);

    const [[url, opts]] = (fetcher as ReturnType<typeof vi.fn>).mock.calls as object as [[string, { headers: Record<string, string>; body: string; method: string }]];
    expect(url).toBe("https://api.hardcover.app/v1/graphql");
    expect(opts.method).toBe("POST");
    expect(opts.headers.authorization).toBe("Bearer key");
    const body = JSON.parse(opts.body) as { variables: { query: string } };
    expect(body.variables.query).toBe("The Hobbit Tolkien");
  });

  it("strips Bearer prefix from key if already present", async () => {
    const fetcher = fakeFetch({ data: { search: { results: [] } } });

    await searchHardcover("Dune", undefined, "Bearer my-token", fetcher);

    const [[, opts]] = (fetcher as ReturnType<typeof vi.fn>).mock.calls as object as [[string, { headers: Record<string, string> }]];
    expect(opts.headers.authorization).toBe("Bearer my-token");
  });

  it("sends query without author when not provided", async () => {
    const fetcher = fakeFetch({ data: { search: { results: [] } } });

    await searchHardcover("Dune", undefined, "key", fetcher);

    const [[, opts]] = (fetcher as ReturnType<typeof vi.fn>).mock.calls as object as [[string, { body: string }]];
    const body = JSON.parse(opts.body) as { variables: { query: string } };
    expect(body.variables.query).toBe("Dune");
  });

  it("throws on non-ok response with body text", async () => {
    const fetcher = fakeFetch("Forbidden", 500);

    await expect(searchHardcover("Error", undefined, "key", fetcher)).rejects.toThrow("Hardcover API error 500");
  });

  it("throws on non-ok response even when text() fails", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.reject(new Error("read failed")),
    }) as object as typeof fetch;

    await expect(searchHardcover("Error", undefined, "key", fetcher)).rejects.toThrow("Hardcover API error 403: ");
  });

  it("returns empty array when results is empty array", async () => {
    const fetcher = fakeFetch({ data: { search: { results: [] } } });

    const result = await searchHardcover("Nothing", undefined, "key", fetcher);

    expect(result).toEqual([]);
  });

  it("throws when graphql data is entirely missing", async () => {
    const fetcher = fakeFetch({});

    await expect(searchHardcover("Bad", undefined, "key", fetcher)).rejects.toThrow("returned no data");
  });

  it("throws when search field is null", async () => {
    const fetcher = fakeFetch({ data: { search: null } });

    await expect(searchHardcover("Bad", undefined, "key", fetcher)).rejects.toThrow("missing 'search' field");
  });

  it("throws when search.results is missing", async () => {
    const fetcher = fakeFetch({ data: { search: {} } });

    await expect(searchHardcover("Empty", undefined, "key", fetcher)).rejects.toThrow("no 'results'");
  });

  it("throws when JSON string parses to a primitive", async () => {
    const fetcher = fakeFetch({ data: { search: { results: JSON.stringify(true) } } });

    await expect(searchHardcover("Bad", undefined, "key", fetcher)).rejects.toThrow("unexpected shape");
  });

  it("throws when results is unexpected primitive type", async () => {
    const fetcher = fakeFetch({ data: { search: { results: 42 } } });

    await expect(searchHardcover("Bad", undefined, "key", fetcher)).rejects.toThrow("unexpected type: number");
  });

  it("parses Typesense-style hits object in results", async () => {
    const fetcher = fakeFetch({
      data: {
        search: {
          results: {
            found: 1,
            hits: [{ document: sampleSearchResult }],
          },
        },
      },
    });

    const results = await searchHardcover("Dune", undefined, "key", fetcher);

    expect(results).toHaveLength(1);
    expect((results as HCBook[])[0]?.title).toBe("Dune");
  });

  it("parses Typesense hits without document wrapper", async () => {
    const fetcher = fakeFetch({
      data: {
        search: {
          results: {
            found: 1,
            hits: [sampleSearchResult],
          },
        },
      },
    });

    const results = await searchHardcover("Dune", undefined, "key", fetcher);

    expect(results).toHaveLength(1);
    expect((results as HCBook[])[0]?.title).toBe("Dune");
  });

  it("parses results object with array under non-hits key", async () => {
    const fetcher = fakeFetch({
      data: {
        search: {
          results: { found: 1, items: [sampleSearchResult] },
        },
      },
    });

    const results = await searchHardcover("Dune", undefined, "key", fetcher);

    expect(results).toHaveLength(1);
    expect((results as HCBook[])[0]?.title).toBe("Dune");
  });

  it("throws when results object has no array values", async () => {
    const fetcher = fakeFetch({ data: { search: { results: { count: 0 } } } });

    await expect(searchHardcover("Bad", undefined, "key", fetcher)).rejects.toThrow("no array");
  });

  it("throws when graphql errors are present", async () => {
    const fetcher = fakeFetch({ data: null, errors: [{ message: "Unauthorized" }] });

    await expect(searchHardcover("Err", undefined, "key", fetcher)).rejects.toThrow("Hardcover GraphQL error: Unauthorized");
  });

  it("throws with fallback message when graphql error has no message", async () => {
    const fetcher = fakeFetch({ data: null, errors: [{}] });

    await expect(searchHardcover("Err", undefined, "key", fetcher)).rejects.toThrow("Unknown GraphQL error");
  });

  it("handles completely empty hit object", async () => {
    const fetcher = fakeFetch({
      data: { search: { results: [{}] } },
    });

    const results = await searchHardcover("Empty", undefined, "key", fetcher);

    const book = (results as HCBook[])[0] as HCBook;
    expect(book.hardcoverId).toBe("0");
    expect(book.title).toBe("");
  });

  it("handles missing optional fields gracefully", async () => {
    const fetcher = fakeFetch({
      data: { search: { results: [{ id: 99, title: "Minimal" }] } },
    });

    const results = await searchHardcover("Minimal", undefined, "key", fetcher);

    const book = (results as HCBook[])[0] as HCBook;
    expect(book.hardcoverId).toBe("99");
    expect(book.title).toBe("Minimal");
    expect(book.description).toBeNull();
    expect(book.authors).toEqual([]);
    expect(book.imageUrl).toBeNull();
    expect(book.categories).toEqual([]);
    expect(book.publisher).toBeNull();
    expect(book.publishedDate).toBeNull();
    expect(book.pageCount).toBeNull();
    expect(book.isbn13).toBeNull();
  });
});

describe("getHardcoverBook", () => {
  it("returns a single book by ID with full detail", async () => {
    const fetcher = fakeFetch({
      data: { books: [sampleDetailBook] },
    });

    const book = await getHardcoverBook("42", "key", fetcher);

    expect(book).not.toBeNull();
    const hcBook = book as HCBook;
    expect(hcBook.hardcoverId).toBe("42");
    expect(hcBook.title).toBe("Dune");
    expect(hcBook.authors).toEqual(["Frank Herbert"]);
    expect(hcBook.publisher).toBe("Chilton Books");
    expect(hcBook.isbn13).toBe("9780441172719");
    expect(hcBook.pageCount).toBe(412);
  });

  it("returns null when book is not found", async () => {
    const fetcher = fakeFetch({ data: { books: [] } });

    const result = await getHardcoverBook("999", "key", fetcher);

    expect(result).toBeNull();
  });

  it("throws on non-ok response", async () => {
    const fetcher = fakeFetch(null, 401);

    await expect(getHardcoverBook("42", "key", fetcher)).rejects.toThrow("Hardcover API error 401");
  });

  it("returns null when data is missing", async () => {
    const fetcher = fakeFetch({ data: null });

    const result = await getHardcoverBook("42", "key", fetcher);

    expect(result).toBeNull();
  });

  it("throws when graphql errors are present", async () => {
    const fetcher = fakeFetch({ data: null, errors: [{ message: "error" }] });

    await expect(getHardcoverBook("42", "key", fetcher)).rejects.toThrow("Hardcover GraphQL error: error");
  });

  it("handles missing detail fields gracefully", async () => {
    const fetcher = fakeFetch({
      data: { books: [{ id: 99, title: "Minimal" }] },
    });

    const book = await getHardcoverBook("99", "key", fetcher) as HCBook;

    expect(book.hardcoverId).toBe("99");
    expect(book.description).toBeNull();
    expect(book.authors).toEqual([]);
    expect(book.publisher).toBeNull();
    expect(book.isbn13).toBeNull();
  });
});
