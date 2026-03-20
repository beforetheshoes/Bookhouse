import { z } from "zod";

function coerceToArray<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.preprocess((val): unknown[] | undefined => {
    if (Array.isArray(val)) return val as unknown[];
    if (val === undefined || val === null) return undefined;
    return [val];
  }, z.array(itemSchema).optional());
}

const coerceBool = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (val === "true") return true;
  if (val === "false") return false;
  return val;
}, z.boolean().optional());

export const librarySearchSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(["title-asc", "title-desc", "recent"]).default("title-asc"),
    q: z.string().optional(),
    format: coerceToArray(z.enum(["EBOOK", "AUDIOBOOK"])),
    authorId: coerceToArray(z.string()),
    seriesId: coerceToArray(z.string()),
    publisher: coerceToArray(z.string()),
    hasCover: coerceBool,
  })
  .strip();

export type LibrarySearchParams = z.infer<typeof librarySearchSchema>;
