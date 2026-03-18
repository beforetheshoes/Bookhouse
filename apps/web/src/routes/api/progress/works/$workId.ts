import { createFileRoute } from "@tanstack/react-router";
import { db } from "@bookhouse/db";
import {
  getWorkProgressView,
  type LibraryServiceDb,
} from "../../../../lib/library-service";

const libraryDb = db as unknown as LibraryServiceDb;

function getAuthenticatedUserId(context: unknown): string | null {
  return (context as { auth?: { user?: { id: string } | null } } | undefined)?.auth?.user?.id ?? null;
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export const workProgressHandlers = {
  GET: async ({ context, params }: { context: unknown; params: { workId: string } }) => {
    const userId = getAuthenticatedUserId(context);

    if (!userId) {
      return jsonError(401, "Authentication required");
    }

    const work = await getWorkProgressView(libraryDb, userId, params.workId);

    if (!work) {
      return jsonError(404, "Work not found");
    }

    return Response.json(work);
  },
};

export const Route = createFileRoute("/api/progress/works/$workId" as never)({
  server: {
    handlers: workProgressHandlers,
  },
});
