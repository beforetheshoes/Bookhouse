import type { H3Event } from "h3";
import type { PassThrough } from "node:stream";

const CONTENT_MEDIA_KINDS = new Set(["EPUB", "PDF", "CBZ", "AUDIO"]);

export interface DownloadAllHandlerDeps {
  db: {
    findEditionFiles: (editionId: string) => Promise<
      Array<{
        id: string;
        fileAsset: {
          absolutePath: string;
          basename: string;
          mimeType: string | null;
          mediaKind: string;
          availabilityStatus: string;
        };
      }>
    >;
  };
  existsSync: (path: string) => boolean;
  createReadStream: (path: string) => NodeJS.ReadableStream;
  createArchive: () => PassThrough & {
    append: (source: NodeJS.ReadableStream, opts: { name: string }) => unknown;
    finalize: () => Promise<void>;
  };
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  sendStream: (event: H3Event, stream: NodeJS.ReadableStream) => unknown;
}

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export function createDownloadAllHandler(deps: DownloadAllHandlerDeps) {
  return async (event: H3Event) => {
    const params = event.context.params as Record<string, string>;
    const editionId = params.editionId as string;

    if (!VALID_ID.test(editionId)) {
      throw Object.assign(new Error("Invalid editionId"), { statusCode: 400, statusMessage: "Invalid editionId" });
    }

    const editionFiles = await deps.db.findEditionFiles(editionId);

    const presentFiles = editionFiles
      .filter((ef) => CONTENT_MEDIA_KINDS.has(ef.fileAsset.mediaKind))
      .filter((ef) => ef.fileAsset.availabilityStatus === "PRESENT")
      .filter((ef) => deps.existsSync(ef.fileAsset.absolutePath));

    if (presentFiles.length === 0) {
      throw Object.assign(new Error("No files available"), { statusCode: 404, statusMessage: "Not found" });
    }

    const archive = deps.createArchive();

    deps.setResponseHeader(event, "Content-Type", "application/zip");
    deps.setResponseHeader(event, "Content-Disposition", `attachment; filename="${editionId}.zip"`);
    deps.setResponseHeader(event, "Cache-Control", "private, no-cache");

    const result = deps.sendStream(event, archive);

    for (const ef of presentFiles) {
      archive.append(deps.createReadStream(ef.fileAsset.absolutePath), { name: ef.fileAsset.basename });
    }

    await archive.finalize();

    return result;
  };
}
