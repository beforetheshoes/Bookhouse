import type { H3Event } from "h3";
import { httpError } from "../../../utils/http-error";

export interface FileDownloadHandlerDeps {
  db: {
    findEditionFile: (id: string) => Promise<{
      fileAsset: {
        absolutePath: string;
        basename: string;
        mimeType: string | null;
        availabilityStatus: string;
      };
    } | null>;
  };
  existsSync: (path: string) => boolean;
  createReadStream: (path: string) => NodeJS.ReadableStream;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  sendStream: (event: H3Event, stream: NodeJS.ReadableStream) => ReadableStream;
}

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export function createFileDownloadHandler(deps: FileDownloadHandlerDeps) {
  return async (event: H3Event) => {
    const params = event.context.params as Record<string, string>;
    const editionFileId = params.editionFileId as string;

    if (!VALID_ID.test(editionFileId)) {
      throw httpError("Invalid editionFileId", 400);
    }

    const record = await deps.db.findEditionFile(editionFileId);

    if (!record) {
      throw httpError("Edition file not found", 404, "Not found");
    }

    if (record.fileAsset.availabilityStatus !== "PRESENT") {
      throw httpError("File not available", 404, "Not found");
    }

    if (!deps.existsSync(record.fileAsset.absolutePath)) {
      throw httpError("File missing from disk", 404, "Not found");
    }

    deps.setResponseHeader(event, "Content-Type", record.fileAsset.mimeType ?? "application/octet-stream");
    deps.setResponseHeader(event, "Content-Disposition", `attachment; filename="${record.fileAsset.basename}"`);
    deps.setResponseHeader(event, "Cache-Control", "private, no-cache");

    return deps.sendStream(event, deps.createReadStream(record.fileAsset.absolutePath));
  };
}
