import { createFileRoute } from "@tanstack/react-router";
import { db } from "@bookhouse/db";
import {
  getUserProgressTrackingMode,
  updateUserProgressTrackingMode,
  type LibraryServiceDb,
} from "../../../lib/library-service";
import { updateUserProgressTrackingModeSchema } from "../../../lib/progress-validation";

const libraryDb = db as unknown as LibraryServiceDb;

function getAuthenticatedUserId(context: unknown): string | null {
  return (context as { auth?: { user?: { id: string } | null } } | undefined)?.auth?.user?.id ?? null;
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export const progressModeHandlers = {
  GET: async ({ context }: { context: unknown }) => {
    const userId = getAuthenticatedUserId(context);

    if (!userId) {
      return jsonError(401, "Authentication required");
    }

    return Response.json({
      progressTrackingMode: await getUserProgressTrackingMode(libraryDb, userId),
    });
  },
  PUT: async ({ context, request }: { context: unknown; request: Request }) => {
    const userId = getAuthenticatedUserId(context);

    if (!userId) {
      return jsonError(401, "Authentication required");
    }

    try {
      const payload = updateUserProgressTrackingModeSchema.parse(await request.json());
      return Response.json({
        progressTrackingMode: await updateUserProgressTrackingMode(
          libraryDb,
          userId,
          payload.progressTrackingMode,
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      return jsonError(400, message);
    }
  },
};

export const Route = createFileRoute("/api/progress/mode" as never)({
  server: {
    handlers: progressModeHandlers,
  },
});
