import { describe, it, expect, vi } from "vitest";
import { searchAudible, lookupAudibleByAsin, type AudibleProduct } from "./audible";

function fakeFetch(body: object | string | null, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  }) as object as typeof fetch;
}

const sampleProduct = {
  asin: "B08G9PRS1K",
  title: "Project Hail Mary",
  authors: [{ asin: "B00G0WYW92", name: "Andy Weir" }],
  narrators: [{ name: "Ray Porter" }],
  publisher_name: "Audible Studios",
  release_date: "2021-05-04",
  runtime_length_min: 970,
  language: "english",
  format_type: "unabridged",
  merchandising_summary: "<p>A lone astronaut must save the earth.</p>",
  product_images: { 500: "https://m.media-amazon.com/images/I/cover.jpg" },
};

describe("searchAudible", () => {
  it("returns parsed products from catalog search", async () => {
    const fetcher = fakeFetch({
      products: [sampleProduct],
      total_results: 1,
    });

    const results = await searchAudible("Project Hail Mary", "Andy Weir", fetcher);

    expect(results).toHaveLength(1);
    const product = (results as AudibleProduct[])[0] as AudibleProduct;
    expect(product.asin).toBe("B08G9PRS1K");
    expect(product.title).toBe("Project Hail Mary");
    expect(product.authors).toEqual(["Andy Weir"]);
    expect(product.narrators).toEqual(["Ray Porter"]);
    expect(product.publisher).toBe("Audible Studios");
    expect(product.publishedDate).toBe("2021-05-04");
    expect(product.durationSeconds).toBe(58200);
    expect(product.language).toBe("english");
    expect(product.description).toBe("A lone astronaut must save the earth.");
    expect(product.coverUrl).toBe("https://m.media-amazon.com/images/I/cover.jpg");
  });

  it("sends correct URL with title and author", async () => {
    const fetcher = fakeFetch({ products: [], total_results: 0 });

    await searchAudible("The Hobbit", "Tolkien", fetcher);

    const [[url]] = (fetcher as ReturnType<typeof vi.fn>).mock.calls as [[string]];
    expect(url).toContain("https://api.audible.com/1.0/catalog/products");
    expect(url).toContain("title=The+Hobbit");
    expect(url).toContain("author=Tolkien");
    expect(url).toContain("num_results=5");
    expect(url).toContain("products_sort_by=Relevance");
  });

  it("omits author param when not provided", async () => {
    const fetcher = fakeFetch({ products: [], total_results: 0 });

    await searchAudible("Dune", undefined, fetcher);

    const [[url]] = (fetcher as ReturnType<typeof vi.fn>).mock.calls as [[string]];
    expect(url).not.toContain("author=");
  });

  it("returns empty array when no products found", async () => {
    const fetcher = fakeFetch({ products: [], total_results: 0 });

    const results = await searchAudible("Nothing", undefined, fetcher);

    expect(results).toEqual([]);
  });

  it("returns null on 404 response", async () => {
    const fetcher = fakeFetch(null, 404);

    const result = await searchAudible("Missing", undefined, fetcher);

    expect(result).toBeNull();
  });

  it("throws on non-ok response", async () => {
    const fetcher = fakeFetch("Server error", 500);

    await expect(searchAudible("Error", undefined, fetcher)).rejects.toThrow("Audible API error: 500");
  });

  it("handles missing optional fields gracefully", async () => {
    const fetcher = fakeFetch({
      products: [{
        asin: "B000000001",
      }],
      total_results: 1,
    });

    const results = await searchAudible("Minimal", undefined, fetcher);

    const product = (results as AudibleProduct[])[0] as AudibleProduct;
    expect(product.asin).toBe("B000000001");
    expect(product.title).toBe("");
    expect(product.authors).toEqual([]);
    expect(product.narrators).toEqual([]);
    expect(product.publisher).toBeNull();
    expect(product.publishedDate).toBeNull();
    expect(product.durationSeconds).toBeNull();
    expect(product.language).toBeNull();
    expect(product.description).toBeNull();
    expect(product.coverUrl).toBeNull();
  });

  it("strips HTML tags from description", async () => {
    const fetcher = fakeFetch({
      products: [{
        ...sampleProduct,
        merchandising_summary: "<p><b>Bold</b> text and <i>italic</i> text.</p>",
      }],
      total_results: 1,
    });

    const results = await searchAudible("Test", undefined, fetcher);

    expect((results as AudibleProduct[])[0]?.description).toBe("Bold text and italic text.");
  });

  it("converts runtime minutes to seconds", async () => {
    const fetcher = fakeFetch({
      products: [{ ...sampleProduct, runtime_length_min: 120 }],
      total_results: 1,
    });

    const results = await searchAudible("Test", undefined, fetcher);

    expect((results as AudibleProduct[])[0]?.durationSeconds).toBe(7200);
  });

  it("handles products with missing products array", async () => {
    const fetcher = fakeFetch({ total_results: 0 });

    const results = await searchAudible("Nothing", undefined, fetcher);

    expect(results).toEqual([]);
  });

  it("uses largest available product image", async () => {
    const fetcher = fakeFetch({
      products: [{
        ...sampleProduct,
        product_images: {
          500: "https://m.media-amazon.com/images/I/500.jpg",
          1024: "https://m.media-amazon.com/images/I/1024.jpg",
        },
      }],
      total_results: 1,
    });

    const results = await searchAudible("Test", undefined, fetcher);

    expect((results as AudibleProduct[])[0]?.coverUrl).toBe("https://m.media-amazon.com/images/I/1024.jpg");
  });

  it("returns null coverUrl when product_images is empty object", async () => {
    const fetcher = fakeFetch({
      products: [{ ...sampleProduct, product_images: {} }],
      total_results: 1,
    });

    const results = await searchAudible("Test", undefined, fetcher);

    expect((results as AudibleProduct[])[0]?.coverUrl).toBeNull();
  });

  it("filters out empty author and narrator names", async () => {
    const fetcher = fakeFetch({
      products: [{
        ...sampleProduct,
        authors: [{ name: "Valid Author" }, { name: "" }, {}],
        narrators: [{ name: "" }, { name: "Valid Narrator" }, {}],
      }],
      total_results: 1,
    });

    const results = await searchAudible("Test", undefined, fetcher);

    const product = (results as AudibleProduct[])[0] as AudibleProduct;
    expect(product.authors).toEqual(["Valid Author"]);
    expect(product.narrators).toEqual(["Valid Narrator"]);
  });

  it("handles multiple products in results", async () => {
    const fetcher = fakeFetch({
      products: [
        sampleProduct,
        { ...sampleProduct, asin: "B000000002", title: "Second Book" },
      ],
      total_results: 2,
    });

    const results = await searchAudible("Test", undefined, fetcher);

    expect(results).toHaveLength(2);
    expect((results as AudibleProduct[])[1]?.asin).toBe("B000000002");
  });
});

describe("lookupAudibleByAsin", () => {
  it("fetches product by ASIN and returns parsed result", async () => {
    const fetcher = fakeFetch({
      product: sampleProduct,
    });

    const result = await lookupAudibleByAsin("B08G9PRS1K", fetcher);

    expect(result).not.toBeNull();
    expect((result as AudibleProduct).asin).toBe("B08G9PRS1K");
    expect((result as AudibleProduct).title).toBe("Project Hail Mary");
    expect((result as AudibleProduct).narrators).toEqual(["Ray Porter"]);
    expect((result as AudibleProduct).durationSeconds).toBe(58200);
  });

  it("sends correct URL with ASIN path and response_groups", async () => {
    const fetcher = fakeFetch({ product: sampleProduct });

    await lookupAudibleByAsin("B08G9PRS1K", fetcher);

    const [[url]] = (fetcher as ReturnType<typeof vi.fn>).mock.calls as [[string]];
    expect(url).toContain("https://api.audible.com/1.0/catalog/products/B08G9PRS1K");
    expect(url).toContain("response_groups=product_attrs");
  });

  it("returns null on 404 response", async () => {
    const fetcher = fakeFetch(null, 404);

    const result = await lookupAudibleByAsin("B000MISSING", fetcher);

    expect(result).toBeNull();
  });

  it("throws on non-ok response", async () => {
    const fetcher = fakeFetch("Server error", 500);

    await expect(lookupAudibleByAsin("B08G9PRS1K", fetcher)).rejects.toThrow("Audible API error: 500");
  });

  it("returns null when product field is missing", async () => {
    const fetcher = fakeFetch({});

    const result = await lookupAudibleByAsin("B08G9PRS1K", fetcher);

    expect(result).toBeNull();
  });
});
