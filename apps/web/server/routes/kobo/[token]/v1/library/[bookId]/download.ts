import { defineEventHandler, setResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { KoboAuthDeps } from "../../../../auth-helper";
import { selectPreferredKoboDeliveryFile } from "@bookhouse/shared";

export interface DownloadHandlerDeps {
  auth: KoboAuthDeps;
  findEditionFile: (editionId: string) => Promise<{
    absolutePath: string;
    basename: string;
    mimeType: string | null;
    availabilityStatus: string;
  } | null>;
  convertToKepub: (epubPath: string) => Promise<string>;
  existsSync: (path: string) => boolean;
  statSync: (path: string) => { size: number };
  createReadStream: (path: string) => NodeJS.ReadableStream;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  sendStream: (event: H3Event, stream: NodeJS.ReadableStream) => unknown;
}

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export function createDownloadHandler(deps: DownloadHandlerDeps) {
  return async (event: H3Event) => {
    const { createKoboAuth } = await import("../../../../auth-helper");
    const auth = createKoboAuth(deps.auth);
    await auth(event);

    const params = event.context.params as Record<string, string>;
    const bookId = params.bookId as string;

    if (!VALID_ID.test(bookId)) {
      throw Object.assign(new Error("Invalid bookId"), {
        statusCode: 400,
        statusMessage: "Invalid bookId",
      });
    }

    const file = await deps.findEditionFile(bookId);

    if (!file) {
      throw Object.assign(new Error("File not found"), {
        statusCode: 404,
        statusMessage: "Not found",
      });
    }

    if (file.availabilityStatus !== "PRESENT") {
      throw Object.assign(new Error("File not available"), {
        statusCode: 404,
        statusMessage: "Not found",
      });
    }

    let filePath = file.absolutePath;
    let fileName = file.basename;
    let contentType = file.mimeType ?? "application/epub+zip";

    const lowerBasename = file.basename.toLowerCase();
    const isExistingKepub =
      file.mimeType === "application/x-kobo-epub+zip" ||
      lowerBasename.endsWith(".kepub.epub");
    const isConvertibleEpub = !isExistingKepub && (
      file.mimeType === "application/epub+zip" ||
      lowerBasename.endsWith(".epub")
    );

    if (isConvertibleEpub) {
      try {
        filePath = await deps.convertToKepub(file.absolutePath);
        fileName = fileName.replace(/\.epub$/, ".kepub.epub");
        contentType = "application/x-kobo-epub+zip";
      } catch {
        // Fall back to original EPUB if conversion fails
      }
    }

    if (!deps.existsSync(filePath)) {
      throw Object.assign(new Error("File missing from disk"), {
        statusCode: 404,
        statusMessage: "Not found",
      });
    }

    const stat = deps.statSync(filePath);
    deps.setResponseHeader(event, "Content-Type", contentType);
    deps.setResponseHeader(event, "Content-Length", String(stat.size));
    deps.setResponseHeader(
      event,
      "Content-Disposition",
      `attachment; filename="${fileName}"`,
    );
    deps.setResponseHeader(event, "Cache-Control", "private, no-cache");

    return deps.sendStream(event, deps.createReadStream(filePath));
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const fs = await import("node:fs");
  const stream = await import("node:stream");
  const h3 = await import("h3");
  const { db } = await import("@bookhouse/db");

  const handler = createDownloadHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
    findEditionFile: async (editionId) => {
      const edition = await db.edition.findUnique({
        where: { id: editionId },
        include: {
          editionFiles: {
            include: { fileAsset: true },
          },
        },
      });

      const deliveryFile = selectPreferredKoboDeliveryFile(
        edition?.editionFiles
          .filter((editionFile) => editionFile.fileAsset.availabilityStatus === "PRESENT")
          .map((editionFile) => ({
            id: editionFile.id,
            role: editionFile.role,
            fileAsset: {
              basename: editionFile.fileAsset.basename,
              mediaKind: editionFile.fileAsset.mediaKind,
            },
          })) ?? [],
      );
      const fileAsset = edition?.editionFiles.find((editionFile) => editionFile.id === deliveryFile?.id)?.fileAsset;
      if (!fileAsset) return null;

      return {
        absolutePath: fileAsset.absolutePath,
        basename: fileAsset.basename,
        mimeType: fileAsset.mimeType,
        availabilityStatus: fileAsset.availabilityStatus,
      };
    },
    convertToKepub: async (epubPath) => {
      const { convertToKepub: convert } = await import("@bookhouse/kobo");
      const { execFile: execFileCb } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { existsSync: exists, mkdirSync } = await import("node:fs");
      const execFile = promisify(execFileCb);
      const cacheDir = process.env.KEPUB_CACHE_DIR ?? "/tmp/kepub-cache";
      return convert(epubPath, cacheDir, {
        execFile: (cmd, args) => execFile(cmd, args),
        existsSync: exists,
        mkdirSync,
      });
    },
    existsSync: fs.existsSync,
    statSync: fs.statSync,
    createReadStream: fs.createReadStream,
    setResponseHeader,
    sendStream: (evt, s) =>
      h3.sendStream(evt, stream.Readable.toWeb(s as InstanceType<typeof stream.Readable>) as ReadableStream),
  });

  return handler(event);
});
/* c8 ignore stop */
