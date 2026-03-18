import { createFileRoute } from "@tanstack/react-router";
import { db } from "@bookhouse/db";
import {
  updateWorkProgressTrackingMode,
  type LibraryServiceDb,
} from "../../../../../lib/library-service";
import { updateWorkProgressTrackingModeSchema } from "../../../../../lib/progress-validation";

const libraryDb = db as unknown as LibraryServiceDb;

function getAuthenticatedUserId(context: unknown): string | null {
  return (context as { auth?: { user?: { id: string } | null } } | undefined)?.auth?.user?.id ?? null;
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export const workProgressModeHandlers = {
  PUT: async ({
    context,
    params,
    request,
  }: {
    context: unknown;
    params: { workId: string };
    request: Request;
  }) => {
    const userId = getAuthenticatedUserId(context);

    if (!userId) {
      return jsonError(401, "Authentication required");
    }

    try {
      const payload = updateWorkProgressTrackingModeSchema.parse({
        ...(await request.json()),
        workId: params.workId,
      });
      return Response.json({
        progressTrackingMode: await updateWorkProgressTrackingMode(
          libraryDb,
          userId,
          payload.workId,
          payload.progressTrackingMode,
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      return jsonError(400, message);
    }
  },
};

export const Route = createFileRoute("/api/progress/works/$workId/mode" as never)({
  server: {
    handlers: workProgressModeHandlers,
  },
});
