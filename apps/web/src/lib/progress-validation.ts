import { ProgressKind, ProgressTrackingMode } from "@bookhouse/domain";
import { z } from "zod";

const locatorValueSchema = z.record(z.string(), z.unknown());

export const readingProgressSourceSchema = z.string().nullable().optional()
  .transform((value) => value ?? null);

export const readingProgressLocatorSchema = z.record(z.string(), locatorValueSchema);

export const readingProgressLookupSchema = z.object({
  editionId: z.string().min(1),
  progressKind: z.nativeEnum(ProgressKind),
  source: readingProgressSourceSchema,
});

export const upsertReadingProgressSchema = readingProgressLookupSchema.extend({
  locator: readingProgressLocatorSchema,
  percent: z.number().min(0).max(1).nullable(),
});

export const updateUserProgressTrackingModeSchema = z.object({
  progressTrackingMode: z.nativeEnum(ProgressTrackingMode),
});

export const getWorkProgressViewSchema = z.object({
  workId: z.string().min(1),
});

export const updateWorkProgressTrackingModeSchema = z.object({
  progressTrackingMode: z.nativeEnum(ProgressTrackingMode).nullable(),
  workId: z.string().min(1),
});

export const collectionIdSchema = z.object({
  collectionId: z.string().trim().min(1),
});

export const workIdSchema = z.object({
  workId: z.string().trim().min(1),
});

export const librarySortSchema = z.enum([
  "title-asc",
  "title-desc",
  "recent-progress",
]);

export const libraryFilterSchema = z.enum([
  "all",
  "with-progress",
  "without-progress",
]);

export const listLibraryWorksSchema = z.object({
  filter: libraryFilterSchema.optional().default("all"),
  sort: librarySortSchema.optional().default("title-asc"),
});

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1),
});

export const renameCollectionSchema = collectionIdSchema.extend({
  name: z.string().trim().min(1),
});

export const deleteCollectionSchema = collectionIdSchema;

export const getCollectionDetailSchema = collectionIdSchema;

export const addWorkToCollectionSchema = collectionIdSchema.extend({
  workId: z.string().trim().min(1),
});

export const removeWorkFromCollectionSchema = addWorkToCollectionSchema;

export const getWorkCollectionMembershipSchema = workIdSchema;

export const externalLinkIdSchema = z.object({
  linkId: z.string().trim().min(1),
});

function parseExternalLinkMetadata(value: string, ctx: z.RefinementCtx): Record<string, unknown> | null {
  if (value === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Metadata must be a JSON object",
      });
      return z.NEVER;
    }

    return parsed as Record<string, unknown>;
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Metadata must be valid JSON",
    });
    return z.NEVER;
  }
}

function parseOptionalDateTime(value: string | null | undefined, ctx: z.RefinementCtx): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "lastSyncedAt must be a valid date-time",
    });
    return z.NEVER;
  }

  return parsed;
}

const externalLinkMutationFieldsSchema = z.object({
  editionId: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
  lastSyncedAt: z.string().trim().nullable().optional().transform((value, ctx) => parseOptionalDateTime(value, ctx)),
  metadata: z.string().trim().transform((value, ctx) => parseExternalLinkMetadata(value, ctx)),
  provider: z.string().trim().min(1),
});

export const listExternalLinksForWorkSchema = workIdSchema;

export const createExternalLinkSchema = externalLinkMutationFieldsSchema;

export const updateExternalLinkSchema = externalLinkIdSchema.extend({
  externalId: z.string().trim().min(1),
  lastSyncedAt: z.string().trim().nullable().optional().transform((value, ctx) => parseOptionalDateTime(value, ctx)),
  metadata: z.string().trim().transform((value, ctx) => parseExternalLinkMetadata(value, ctx)),
  provider: z.string().trim().min(1),
});

export const deleteExternalLinkSchema = externalLinkIdSchema;
