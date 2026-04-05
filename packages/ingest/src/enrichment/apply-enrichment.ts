export type ApplyFieldValue = string | string[] | number | null;

export type UpdateData = Record<string, ApplyFieldValue | Date>;

export interface ApplyEnrichmentInput {
  workId: string;
  editionId?: string;
  workFields: Record<string, ApplyFieldValue>;
  editionFields: Record<string, ApplyFieldValue>;
  source: {
    provider: string;
    externalId: string;
  };
}

export interface ApplyEnrichmentDeps {
  findWork: (workId: string) => Promise<{ editedFields: string[] } | null>;
  updateWork: (workId: string, data: UpdateData) => Promise<void>;
  findEdition: (editionId: string) => Promise<{ editedFields: string[] } | null>;
  updateEdition: (editionId: string, data: UpdateData) => Promise<void>;
  findTagByCanonical: (canonical: string) => Promise<string | null>;
  createTag: (name: string, canonical: string) => Promise<string>;
  upsertWorkTag: (workId: string, tagId: string) => Promise<void>;
  findContributorByCanonical: (canonical: string) => Promise<string | null>;
  createContributor: (name: string, canonical: string) => Promise<string>;
  findEditionIdsByWorkId: (workId: string) => Promise<string[]>;
  deleteAuthorContributors: (editionIds: string[]) => Promise<void>;
  createEditionContributors: (editionIds: string[], contributorIds: string[]) => Promise<void>;
  deleteNarratorContributors: (editionId: string) => Promise<void>;
  createNarratorContributors: (editionId: string, contributorIds: string[]) => Promise<void>;
  upsertExternalLink: (data: {
    workId: string;
    provider: string;
    externalId: string;
    appliedFields: string[];
  }) => Promise<void>;
  canonicalizeContributorName: (name: string) => string | null | undefined;
}

export interface ApplyEnrichmentResult {
  success: true;
  skippedAll?: true;
  appliedFields?: string[];
}

function getEditedFieldKey(fieldKey: string): string {
  if (fieldKey === "title") return "titleDisplay";
  return fieldKey;
}

export async function applyEnrichmentFields(
  input: ApplyEnrichmentInput,
  deps: ApplyEnrichmentDeps,
): Promise<ApplyEnrichmentResult> {
  let appliedAnyFields = false;
  const allAppliedFields: string[] = [];

  // --- Work-level fields ---
  if (Object.keys(input.workFields).length > 0) {
    const work = await deps.findWork(input.workId);
    const editedFields = work?.editedFields ?? [];
    const filteredFields: Record<string, ApplyFieldValue> = Object.fromEntries(
      Object.entries(input.workFields).filter(([key]) => !editedFields.includes(getEditedFieldKey(key))),
    );

    // Map enrichment field names to DB column names
    if ("title" in filteredFields) {
      filteredFields.titleDisplay = filteredFields.title;
      delete filteredFields.title;
    }

    // Handle authors separately
    const authors = filteredFields.authors as string[] | undefined;
    delete filteredFields.authors;

    // Handle subjects separately
    const subjects = filteredFields.subjects as string[] | undefined;
    delete filteredFields.subjects;

    // Strip coverUrl — handled separately (download + processing)
    delete filteredFields.coverUrl;

    // Apply remaining scalar work fields
    if (Object.keys(filteredFields).length > 0) {
      await deps.updateWork(input.workId, filteredFields as UpdateData);
      appliedAnyFields = true;
      allAppliedFields.push(...Object.keys(filteredFields));
    }

    // Apply subjects as tags
    if (subjects && subjects.length > 0) {
      for (const tagName of subjects) {
        const trimmed = tagName.trim();
        if (trimmed === "") continue;
        const canonical = trimmed.toLowerCase();
        const existing = await deps.findTagByCanonical(canonical);
        const tagId = existing ?? await deps.createTag(trimmed, canonical);
        await deps.upsertWorkTag(input.workId, tagId);
      }
      appliedAnyFields = true;
      allAppliedFields.push("subjects");
    }

    // Apply authors via Contributor + EditionContributor
    if (authors && authors.length > 0) {
      const editionIds = await deps.findEditionIdsByWorkId(input.workId);
      const contributorIds: string[] = [];
      for (const authorName of authors) {
        const trimmed = authorName.trim();
        if (trimmed === "") continue;
        const canonical = deps.canonicalizeContributorName(trimmed) ?? trimmed.toLowerCase();
        const existing = await deps.findContributorByCanonical(canonical);
        contributorIds.push(existing ?? await deps.createContributor(trimmed, canonical));
      }
      await deps.deleteAuthorContributors(editionIds);
      await deps.createEditionContributors(editionIds, contributorIds);
      appliedAnyFields = true;
      allAppliedFields.push("authors");
    }
  }

  // --- Edition-level fields ---
  if (input.editionId && Object.keys(input.editionFields).length > 0) {
    const edition = await deps.findEdition(input.editionId);
    const editedFields = edition?.editedFields ?? [];
    const filteredFields: Record<string, string | string[] | number | Date | null> = Object.fromEntries(
      Object.entries(input.editionFields).filter(([key]) => !editedFields.includes(key)),
    );

    // Map publishedDate → publishedAt
    if ("publishedDate" in filteredFields) {
      const val = filteredFields.publishedDate as string | null;
      delete filteredFields.publishedDate;
      filteredFields.publishedAt = val ? new Date(val) : null;
    }

    // Handle narrators separately (per-edition, not per-work)
    const narrators = filteredFields.narrators as string[] | undefined;
    delete filteredFields.narrators;

    if (Object.keys(filteredFields).length > 0) {
      await deps.updateEdition(input.editionId, filteredFields as UpdateData);
      appliedAnyFields = true;
      allAppliedFields.push(...Object.keys(filteredFields));
    }

    // Apply narrators via Contributor + EditionContributor (scoped to this edition only)
    if (narrators && narrators.length > 0) {
      const contributorIds: string[] = [];
      for (const narratorName of narrators) {
        const trimmed = narratorName.trim();
        if (trimmed === "") continue;
        const canonical = deps.canonicalizeContributorName(trimmed) ?? trimmed.toLowerCase();
        const existing = await deps.findContributorByCanonical(canonical);
        contributorIds.push(existing ?? await deps.createContributor(trimmed, canonical));
      }
      await deps.deleteNarratorContributors(input.editionId);
      await deps.createNarratorContributors(input.editionId, contributorIds);
      appliedAnyFields = true;
      allAppliedFields.push("narrators");
    }
  }

  // --- Mark enriched + provenance ---
  if (appliedAnyFields) {
    await deps.updateWork(input.workId, { enrichmentStatus: "ENRICHED" });
    await deps.upsertExternalLink({
      workId: input.workId,
      provider: input.source.provider,
      externalId: input.source.externalId,
      appliedFields: allAppliedFields,
    });
    return { success: true, appliedFields: allAppliedFields };
  }

  return { success: true, skippedAll: true };
}
