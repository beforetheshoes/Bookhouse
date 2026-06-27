import { createError, getQuery } from "h3";
import type { H3Event } from "h3";
import type { z } from "zod";

// Validate h3 route params/query with a zod schema, returning the typed result
// and answering with a 400 on a malformed request — so routes stop casting
// `event.context.params as ...` and hand-narrowing query strings.
//
// `result.data` is `any` for a generic schema, but the function's return type
// (`z.infer<T>`) is the contract callers actually see; the eslint-disable just
// acknowledges that zod-generics limitation.

export function parseParams<T extends z.ZodTypeAny>(
  event: H3Event,
  schema: T,
): z.infer<T> {
  const result = schema.safeParse(event.context.params);
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: "Bad Request" });
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(
  event: H3Event,
  schema: T,
): z.infer<T> {
  const result = schema.safeParse(getQuery(event));
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: "Bad Request" });
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return result.data;
}
