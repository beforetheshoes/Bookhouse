import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import type { Readable } from "node:stream";
import { defineEventHandler, setResponseHeader } from "h3";
import type { H3Event } from "h3";
import { createLogsArchive } from "~/lib/logs/create-logs-archive";

export interface LogsDownloadHandlerDeps {
  createArchive: () => Promise<Readable>;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  sendStream: (event: H3Event, stream: Readable) => Readable;
  requireOwner: (event: H3Event) => void;
}

export function createLogsDownloadHandler(deps: LogsDownloadHandlerDeps) {
  return async (event: H3Event) => {
    deps.requireOwner(event);
    const stream = await deps.createArchive();

    deps.setResponseHeader(event, "Content-Type", "application/zip");
    deps.setResponseHeader(
      event,
      "Content-Disposition",
      `attachment; filename="bookhouse-logs.zip"`,
    );

    return deps.sendStream(event, stream);
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createLogsDownloadHandler */
export default defineEventHandler(async (event) => {
  const logDir = process.env.LOG_DIR ?? "/data/logs";
  const { requireOwnerFromEvent } = await import("../../../middleware/auth");

  const handler = createLogsDownloadHandler({
    createArchive: () =>
      createLogsArchive({
        logDir,
        readdir: (dir) => readdir(dir),
        createReadStream,
      }),
    setResponseHeader,
    // h3 v2's sendStream is identity (returns the value); stream directly.
    sendStream: (_event, stream) => stream,
    requireOwner: (e) => {
      requireOwnerFromEvent(e);
    },
  });
  return handler(event);
});
/* c8 ignore stop */
