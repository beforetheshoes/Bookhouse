import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyEnrichmentFields, type ApplyEnrichmentInput, type ApplyEnrichmentDeps } from "./apply-enrichment";

function makeInput(overrides: Partial<ApplyEnrichmentInput> = {}): ApplyEnrichmentInput {
  return {
    workId: "w1",
    editionId: "e1",
    workFields: {},
    editionFields: {},
    source: { provider: "openlibrary", externalId: "OL1W" },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ApplyEnrichmentDeps> = {}): ApplyEnrichmentDeps {
  return {
    findWork: vi.fn().mockResolvedValue({ editedFields: [] }),
    updateWork: vi.fn().mockResolvedValue(undefined),
    findEdition: vi.fn().mockResolvedValue({ editedFields: [] }),
    updateEdition: vi.fn().mockResolvedValue(undefined),
    findTagByCanonical: vi.fn().mockResolvedValue(null),
    createTag: vi.fn().mockImplementation((_name: string, canonical: string) =>
      Promise.resolve(`tag-${canonical}`),
    ),
    upsertWorkTag: vi.fn().mockResolvedValue(undefined),
    findContributorByCanonical: vi.fn().mockResolvedValue(null),
    createContributor: vi.fn().mockImplementation((_name: string, canonical: string) =>
      Promise.resolve(`contrib-${canonical}`),
    ),
    findEditionIdsByWorkId: vi.fn().mockResolvedValue(["e1"]),
    deleteAuthorContributors: vi.fn().mockResolvedValue(undefined),
    createEditionContributors: vi.fn().mockResolvedValue(undefined),
    upsertExternalLink: vi.fn().mockResolvedValue(undefined),
    canonicalizeContributorName: (name: string) => name.toLowerCase(),
    ...overrides,
  };
}

describe("applyEnrichmentFields", () => {
  let deps: ApplyEnrichmentDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("applies work-level scalar fields", async () => {
    const input = makeInput({
      workFields: { description: "A great book" },
    });

    const result = await applyEnrichmentFields(input, deps);

    expect(deps.updateWork).toHaveBeenCalledWith("w1", { description: "A great book" });
    expect(result).toEqual({ success: true, appliedFields: ["description"] });
  });

  it("maps 'title' to 'titleDisplay' for work updates", async () => {
    const input = makeInput({
      workFields: { title: "New Title" },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.updateWork).toHaveBeenCalledWith("w1", { titleDisplay: "New Title" });
  });

  it("skips work fields that are in editedFields", async () => {
    deps = makeDeps({
      findWork: vi.fn().mockResolvedValue({ editedFields: ["description"] }),
    });
    const input = makeInput({
      workFields: { description: "A great book" },
    });

    const result = await applyEnrichmentFields(input, deps);

    expect(deps.updateWork).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, skippedAll: true });
  });

  it("skips titleDisplay-mapped editedFields for title", async () => {
    deps = makeDeps({
      findWork: vi.fn().mockResolvedValue({ editedFields: ["titleDisplay"] }),
    });
    const input = makeInput({
      workFields: { title: "New Title" },
    });

    const result = await applyEnrichmentFields(input, deps);

    expect(deps.updateWork).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, skippedAll: true });
  });

  it("applies subjects as tags", async () => {
    const input = makeInput({
      workFields: { subjects: ["Fiction", "Drama"] },
    });

    const result = await applyEnrichmentFields(input, deps);

    expect(deps.findTagByCanonical).toHaveBeenCalledTimes(2);
    expect(deps.createTag).toHaveBeenCalledTimes(2);
    expect(deps.upsertWorkTag).toHaveBeenCalledTimes(2);
    expect(result.appliedFields).toContain("subjects");
  });

  it("reuses existing tags by canonical name", async () => {
    deps = makeDeps({
      findTagByCanonical: vi.fn().mockResolvedValue("existing-tag-id"),
    });
    const input = makeInput({
      workFields: { subjects: ["Fiction"] },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.createTag).not.toHaveBeenCalled();
    expect(deps.upsertWorkTag).toHaveBeenCalledWith("w1", "existing-tag-id");
  });

  it("skips empty subject strings", async () => {
    const input = makeInput({
      workFields: { subjects: ["Fiction", "", "  "] },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.findTagByCanonical).toHaveBeenCalledTimes(1);
  });

  it("applies authors via contributor creation and edition linking", async () => {
    const input = makeInput({
      workFields: { authors: ["Jane Austen", "Charlotte Bronte"] },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.findContributorByCanonical).toHaveBeenCalledTimes(2);
    expect(deps.createContributor).toHaveBeenCalledTimes(2);
    expect(deps.deleteAuthorContributors).toHaveBeenCalledWith(["e1"]);
    expect(deps.createEditionContributors).toHaveBeenCalledWith(
      ["e1"],
      ["contrib-jane austen", "contrib-charlotte bronte"],
    );
  });

  it("reuses existing contributors by canonical name", async () => {
    deps = makeDeps({
      findContributorByCanonical: vi.fn().mockResolvedValue("existing-contrib-id"),
    });
    const input = makeInput({
      workFields: { authors: ["Jane Austen"] },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.createContributor).not.toHaveBeenCalled();
    expect(deps.createEditionContributors).toHaveBeenCalledWith(["e1"], ["existing-contrib-id"]);
  });

  it("skips empty author strings", async () => {
    const input = makeInput({
      workFields: { authors: ["Jane Austen", "", "  "] },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.findContributorByCanonical).toHaveBeenCalledTimes(1);
  });

  it("strips coverUrl from work fields (handled separately)", async () => {
    const input = makeInput({
      workFields: { coverUrl: "https://example.com/cover.jpg", description: "A book" },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.updateWork).toHaveBeenCalledWith("w1", { description: "A book" });
  });

  it("applies edition-level fields", async () => {
    const input = makeInput({
      editionFields: { publisher: "Penguin", pageCount: 320 },
    });

    const result = await applyEnrichmentFields(input, deps);

    expect(deps.updateEdition).toHaveBeenCalledWith("e1", { publisher: "Penguin", pageCount: 320 });
    expect(result.appliedFields).toContain("publisher");
    expect(result.appliedFields).toContain("pageCount");
  });

  it("maps publishedDate to publishedAt as a Date", async () => {
    const input = makeInput({
      editionFields: { publishedDate: "2020-01-15" },
    });

    await applyEnrichmentFields(input, deps);

    const call = (deps.updateEdition as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, string | string[] | number | Date | null>];
    expect(call[1].publishedAt).toBeInstanceOf(Date);
    expect((call[1].publishedAt as Date).toISOString()).toContain("2020-01-15");
  });

  it("maps null publishedDate to null publishedAt", async () => {
    const input = makeInput({
      editionFields: { publishedDate: null },
    });

    await applyEnrichmentFields(input, deps);

    const call = (deps.updateEdition as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, string | string[] | number | Date | null>];
    expect(call[1].publishedAt).toBeNull();
  });

  it("skips edition fields in editedFields", async () => {
    deps = makeDeps({
      findEdition: vi.fn().mockResolvedValue({ editedFields: ["publisher"] }),
    });
    const input = makeInput({
      editionFields: { publisher: "Penguin", pageCount: 320 },
    });

    await applyEnrichmentFields(input, deps);

    const call = (deps.updateEdition as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, string | string[] | number | Date | null>];
    expect(call[1]).toEqual({ pageCount: 320 });
  });

  it("skips edition update entirely when all fields are edited", async () => {
    deps = makeDeps({
      findEdition: vi.fn().mockResolvedValue({ editedFields: ["publisher", "pageCount"] }),
    });
    const input = makeInput({
      editionFields: { publisher: "Penguin", pageCount: 320 },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.updateEdition).not.toHaveBeenCalled();
  });

  it("skips edition fields when no editionId provided", async () => {
    const input = makeInput({
      editionId: undefined,
      editionFields: { publisher: "Penguin" },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.updateEdition).not.toHaveBeenCalled();
  });

  it("marks work as ENRICHED and creates provenance record", async () => {
    const input = makeInput({
      workFields: { description: "A great book" },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.updateWork).toHaveBeenCalledTimes(2);
    const secondCall = (deps.updateWork as ReturnType<typeof vi.fn>).mock.calls[1] as [string, Record<string, string | string[] | number | Date | null>];
    expect(secondCall[1]).toEqual({ enrichmentStatus: "ENRICHED" });
    expect(deps.upsertExternalLink).toHaveBeenCalledWith({
      workId: "w1",
      provider: "openlibrary",
      externalId: "OL1W",
      appliedFields: ["description"],
    });
  });

  it("returns skippedAll when no fields were applied", async () => {
    const input = makeInput({
      workFields: {},
      editionFields: {},
    });

    const result = await applyEnrichmentFields(input, deps);

    expect(result).toEqual({ success: true, skippedAll: true });
    expect(deps.upsertExternalLink).not.toHaveBeenCalled();
  });

  it("handles null work from findWork gracefully", async () => {
    deps = makeDeps({
      findWork: vi.fn().mockResolvedValue(null),
    });
    const input = makeInput({
      workFields: { description: "A great book" },
    });

    const result = await applyEnrichmentFields(input, deps);

    // Should still apply since null work means no editedFields
    expect(deps.updateWork).toHaveBeenCalledWith("w1", { description: "A great book" });
    expect(result.appliedFields).toContain("description");
  });

  it("handles null edition from findEdition gracefully", async () => {
    deps = makeDeps({
      findEdition: vi.fn().mockResolvedValue(null),
    });
    const input = makeInput({
      editionFields: { publisher: "Penguin" },
    });

    const result = await applyEnrichmentFields(input, deps);

    expect(deps.updateEdition).toHaveBeenCalledWith("e1", { publisher: "Penguin" });
    expect(result.appliedFields).toContain("publisher");
  });

  it("falls back to lowercase when canonicalizeContributorName returns null", async () => {
    deps = makeDeps({
      canonicalizeContributorName: () => null,
    });
    const input = makeInput({
      workFields: { authors: ["Jane Austen"] },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.findContributorByCanonical).toHaveBeenCalledWith("jane austen");
  });

  it("combines work and edition field names in provenance", async () => {
    const input = makeInput({
      workFields: { description: "A book" },
      editionFields: { publisher: "Penguin" },
    });

    await applyEnrichmentFields(input, deps);

    expect(deps.upsertExternalLink).toHaveBeenCalledWith(
      expect.objectContaining({
        appliedFields: expect.arrayContaining(["description", "publisher"]) as string[],
      }),
    );
  });
});
