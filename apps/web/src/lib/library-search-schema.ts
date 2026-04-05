import { z } from "zod";

function coerceToArray<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.union([
    z.array(itemSchema),
    itemSchema.transform((val: z.infer<T>) => [val]),
  ]).optional();
}

const coerceBool = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (val === "true") return true;
  if (val === "false") return false;
  return val;
}, z.boolean().optional());

export const SORT_OPTIONS = [
  "title-asc", "title-desc",
  "author-asc", "author-desc",
  "format-asc", "format-desc",
  "recent",
  "publisher-asc", "publisher-desc",
  "publishDate-asc", "publishDate-desc",
  "pageCount-asc", "pageCount-desc",
  "duration-asc", "duration-desc",
  "narrator-asc", "narrator-desc",
  "isbn13-asc", "isbn13-desc",
  "isbn10-asc", "isbn10-desc",
  "asin-asc", "asin-desc",
] as const;

export const librarySearchSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(SORT_OPTIONS).default("title-asc"),
    view: z.enum(["works", "editions"]).default("works"),
    q: z.string().optional(),
    format: coerceToArray(z.enum(["EBOOK", "AUDIOBOOK"])),
    authorId: coerceToArray(z.string()),
    seriesId: coerceToArray(z.string()),
    hasCover: coerceBool,
    enriched: coerceBool,
    hasDescription: coerceBool,
    inSeries: coerceBool,
  })
  .strip();

export type LibrarySearchParams = z.infer<typeof librarySearchSchema>;
