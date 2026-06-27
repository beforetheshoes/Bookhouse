import type { H3Event } from "h3";
import { httpError } from "../../../utils/http-error";

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
  createArchive: () => NodeJS.ReadableStream & {
    append: (source: NodeJS.ReadableStream, opts: { name: string }) => void;
    finalize: () => Promise<void>;
  };
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  sendStream: (event: H3Event, stream: NodeJS.ReadableStream) => ReadableStream;
}

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export function createDownloadAllHandler(deps: DownloadAllHandlerDeps) {
  return async (event: H3Event) => {
    const params = event.context.params as Record<string, string>;
    const editionId = params.editionId as string;

    if (!VALID_ID.test(editionId)) {
      throw httpError("Invalid editionId", 400);
    }

    const editionFiles = await deps.db.findEditionFiles(editionId);

    const presentFiles = editionFiles
      .filter((ef) => CONTENT_MEDIA_KINDS.has(ef.fileAsset.mediaKind))
      .filter((ef) => ef.fileAsset.availabilityStatus === "PRESENT")
      .filter((ef) => deps.existsSync(ef.fileAsset.absolutePath));

    if (presentFiles.length === 0) {
      throw httpError("No files available", 404, "Not found");
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
