import { createFileRoute } from "@tanstack/react-router";
import { db } from "@bookhouse/db";
import {
  deleteReadingProgress,
  getReadingProgress,
  upsertReadingProgress,
  type LibraryServiceDb,
} from "../../lib/library-service";
import {
  readingProgressLookupSchema,
  upsertReadingProgressSchema,
} from "../../lib/progress-validation";

const libraryDb = db as unknown as LibraryServiceDb;

function getAuthenticatedUserId(context: unknown): string | null {
  return (context as { auth?: { user?: { id: string } | null } } | undefined)?.auth?.user?.id ?? null;
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function validationError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Invalid request";
  return jsonError(400, message);
}

export const progressHandlers = {
  GET: async ({ context, request }: { context: unknown; request: Request }) => {
    const userId = getAuthenticatedUserId(context);

    if (!userId) {
      return jsonError(401, "Authentication required");
    }

    try {
      const url = new URL(request.url);
      const lookup = readingProgressLookupSchema.parse({
        editionId: url.searchParams.get("editionId"),
        progressKind: url.searchParams.get("progressKind"),
        source: url.searchParams.get("source"),
      });
      const progress = await getReadingProgress(libraryDb, userId, lookup);

      if (!progress) {
        return jsonError(404, "Reading progress not found");
      }

      return Response.json(progress);
    } catch (error) {
      return validationError(error);
    }
  },
  PUT: async ({ context, request }: { context: unknown; request: Request }) => {
    const userId = getAuthenticatedUserId(context);

    if (!userId) {
      return jsonError(401, "Authentication required");
    }

    try {
      const payload = upsertReadingProgressSchema.parse(await request.json());
      const progress = await upsertReadingProgress(libraryDb, userId, payload);
      return Response.json(progress);
    } catch (error) {
      return validationError(error);
    }
  },
  DELETE: async ({ context, request }: { context: unknown; request: Request }) => {
    const userId = getAuthenticatedUserId(context);

    if (!userId) {
      return jsonError(401, "Authentication required");
    }

    try {
      const payload = readingProgressLookupSchema.parse(await request.json());
      await deleteReadingProgress(libraryDb, userId, payload);
      return new Response(null, { status: 204 });
    } catch (error) {
      return validationError(error);
    }
  },
};

export const Route = createFileRoute("/api/progress" as never)({
  server: {
    handlers: progressHandlers,
  },
});
