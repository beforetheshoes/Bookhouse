import { describe, it, expect, vi } from "vitest";
import { searchWikidataAuthors, buildWikimediaThumbUrl } from "./wikidata";

function fakeFetch(responses: Array<{ body: object; status?: number }>): typeof fetch {
  let callIndex = 0;
  return vi.fn((() => {
    const resp = responses[callIndex++];
    const status = resp?.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(resp?.body),
    });
  }) as () => Promise<Response>) as typeof fetch;
}

describe("buildWikimediaThumbUrl", () => {
  it("constructs a valid thumbnail URL", () => {
    const url = buildWikimediaThumbUrl("N. K. Jemisin.jpg");
    expect(url).toContain("upload.wikimedia.org/wikipedia/commons/thumb/");
    expect(url).toContain("N._K._Jemisin.jpg");
    expect(url).toContain("200px-");
  });

  it("handles filenames without spaces", () => {
    const url = buildWikimediaThumbUrl("Example.jpg");
    expect(url).toContain("Example.jpg");
    expect(url).toContain("/200px-Example.jpg");
  });
});

describe("searchWikidataAuthors", () => {
  it("searches entities and fetches image claims", async () => {
    const fetcher = fakeFetch([
      // wbsearchentities response
      {
        body: {
          search: [
            { id: "Q2427544", display: { label: { value: "N. K. Jemisin" } } },
          ],
        },
      },
      // wbgetclaims P18 response
      {
        body: {
          claims: {
            P18: [{ mainsnak: { datavalue: { value: "N. K. Jemisin.jpg" } } }],
          },
        },
      },
    ]);

    const results = await searchWikidataAuthors("N.K. Jemisin", fetcher);

    expect(results).toHaveLength(1);
    expect(results[0]?.qid).toBe("Q2427544");
    expect(results[0]?.name).toBe("N. K. Jemisin");
    expect(results[0]?.imageUrl).toContain("N._K._Jemisin.jpg");
  });

  it("returns empty array when no search results", async () => {
    const fetcher = fakeFetch([
      { body: { search: [] } },
    ]);

    const results = await searchWikidataAuthors("Nobody", fetcher);

    expect(results).toEqual([]);
  });

  it("returns author with null imageUrl when no P18 claim", async () => {
    const fetcher = fakeFetch([
      {
        body: {
          search: [
            { id: "Q12345", display: { label: { value: "Some Author" } } },
          ],
        },
      },
      { body: { claims: {} } },
    ]);

    const results = await searchWikidataAuthors("Some Author", fetcher);

    expect(results).toHaveLength(1);
    expect(results[0]?.imageUrl).toBeNull();
  });

  it("throws on search API error", async () => {
    const fetcher = fakeFetch([
      { body: {}, status: 500 },
    ]);

    await expect(searchWikidataAuthors("test", fetcher)).rejects.toThrow("Wikidata API error: 500");
  });

  it("returns null imageUrl when claims API fails", async () => {
    const fetcher = fakeFetch([
      {
        body: {
          search: [
            { id: "Q99", display: { label: { value: "Author" } } },
          ],
        },
      },
      { body: {}, status: 500 },
    ]);

    const results = await searchWikidataAuthors("Author", fetcher);

    expect(results).toHaveLength(1);
    expect(results[0]?.imageUrl).toBeNull();
  });

  it("returns null imageUrl when claims response is invalid JSON", async () => {
    let callIndex = 0;
    const fetcher = vi.fn((() => {
      callIndex++;
      if (callIndex === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            search: [{ id: "Q99", display: { label: { value: "Author" } } }],
          }),
        });
      }
      // Claims call throws on json()
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error("invalid json")),
      });
    }) as () => Promise<Response>) as typeof fetch;

    const results = await searchWikidataAuthors("Author", fetcher);

    expect(results[0]?.imageUrl).toBeNull();
  });

  it("handles missing display label", async () => {
    const fetcher = fakeFetch([
      {
        body: {
          search: [
            { id: "Q99" },
          ],
        },
      },
      { body: { claims: {} } },
    ]);

    const results = await searchWikidataAuthors("Unknown", fetcher);

    expect(results[0]?.name).toBe("");
  });
});
