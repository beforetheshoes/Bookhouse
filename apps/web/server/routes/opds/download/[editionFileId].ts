import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsAuthDeps } from "../auth-helper";

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export interface OpdsDownloadHandlerDeps {
  auth: OpdsAuthDeps;
  findEditionFile: (id: string) => Promise<{
    absolutePath: string;
    basename: string;
    mimeType: string | null;
    availabilityStatus: string;
  } | null>;
  existsSync: (path: string) => boolean;
  createReadStream: (path: string) => NodeJS.ReadableStream;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  sendStream: (event: H3Event, stream: NodeJS.ReadableStream) => unknown;
}

export function createOpdsDownloadHandler(deps: OpdsDownloadHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("../auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const params = event.context.params as Record<string, string>;
    const editionFileId = params.editionFileId as string;

    if (!VALID_ID.test(editionFileId)) {
      throw Object.assign(new Error("Invalid editionFileId"), {
        statusCode: 400,
        statusMessage: "Invalid editionFileId",
      });
    }

    const record = await deps.findEditionFile(editionFileId);

    if (!record) {
      throw Object.assign(new Error("Edition file not found"), {
        statusCode: 404,
        statusMessage: "Not found",
      });
    }

    if (record.availabilityStatus !== "PRESENT") {
      throw Object.assign(new Error("File not available"), {
        statusCode: 404,
        statusMessage: "Not found",
      });
    }

    if (!deps.existsSync(record.absolutePath)) {
      throw Object.assign(new Error("File missing from disk"), {
        statusCode: 404,
        statusMessage: "Not found",
      });
    }

    deps.setResponseHeader(event, "Content-Type", record.mimeType ?? "application/epub+zip");
    deps.setResponseHeader(event, "Content-Disposition", `attachment; filename="${record.basename}"`);
    deps.setResponseHeader(event, "Cache-Control", "private, no-cache");

    return deps.sendStream(event, deps.createReadStream(record.absolutePath));
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { verifyPassword } = await import("@bookhouse/opds");
  const { existsSync, createReadStream } = await import("node:fs");
  const stream = await import("node:stream");
  const h3 = await import("h3");

  const handler = createOpdsDownloadHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    findEditionFile: async (id) => {
      const ef = await db.editionFile.findUnique({
        where: { id },
        include: { fileAsset: true },
      });
      if (!ef) return null;
      return {
        absolutePath: ef.fileAsset.absolutePath,
        basename: ef.fileAsset.basename,
        mimeType: ef.fileAsset.mimeType,
        availabilityStatus: ef.fileAsset.availabilityStatus,
      };
    },
    existsSync,
    createReadStream,
    setResponseHeader: (e, name, value) => {
      h3SetResponseHeader(e, name, value);
    },
    sendStream: (evt, s) =>
      h3.sendStream(evt, stream.Readable.toWeb(s as InstanceType<typeof stream.Readable>) as ReadableStream),
  });

  return handler(event);
});
/* c8 ignore stop */
