import type { H3Event } from "h3";

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
  sendStream: (event: H3Event, stream: NodeJS.ReadableStream) => unknown;
}

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export function createFileDownloadHandler(deps: FileDownloadHandlerDeps) {
  return async (event: H3Event) => {
    const params = event.context.params as Record<string, string>;
    const editionFileId = params.editionFileId as string;

    if (!VALID_ID.test(editionFileId)) {
      throw Object.assign(new Error("Invalid editionFileId"), { statusCode: 400, statusMessage: "Invalid editionFileId" });
    }

    const record = await deps.db.findEditionFile(editionFileId);

    if (!record) {
      throw Object.assign(new Error("Edition file not found"), { statusCode: 404, statusMessage: "Not found" });
    }

    if (record.fileAsset.availabilityStatus !== "PRESENT") {
      throw Object.assign(new Error("File not available"), { statusCode: 404, statusMessage: "Not found" });
    }

    if (!deps.existsSync(record.fileAsset.absolutePath)) {
      throw Object.assign(new Error("File missing from disk"), { statusCode: 404, statusMessage: "Not found" });
    }

    deps.setResponseHeader(event, "Content-Type", record.fileAsset.mimeType ?? "application/octet-stream");
    deps.setResponseHeader(event, "Content-Disposition", `attachment; filename="${record.fileAsset.basename}"`);
    deps.setResponseHeader(event, "Cache-Control", "private, no-cache");

    return deps.sendStream(event, deps.createReadStream(record.fileAsset.absolutePath));
  };
}
