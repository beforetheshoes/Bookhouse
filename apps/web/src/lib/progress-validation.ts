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
