import path from "node:path";
import type { H3Event } from "h3";

export interface CoverHandlerDeps {
  existsSync: (path: string) => boolean;
  createReadStream: (path: string) => NodeJS.ReadableStream;
  coverCacheDir: string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
  sendStream: (event: H3Event, stream: NodeJS.ReadableStream) => unknown;
  idParamName?: string;
}

const VALID_SIZES = new Set(["thumb", "medium"]);
const VALID_WORK_ID = /^[a-zA-Z0-9_-]+$/;
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
  <rect width="200" height="300" fill="#e2e8f0"/>
  <text x="100" y="150" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-size="48" fill="#94a3b8">?</text>
</svg>`;

export function createCoverHandler(deps: CoverHandlerDeps) {
  const idParam = deps.idParamName ?? "workId";

  return async (event: H3Event) => {
    const params = event.context.params as Record<string, string>;
    const id = params[idParam] as string;
    const size = params.size as string;

    if (!VALID_WORK_ID.test(id)) {
      throw Object.assign(new Error(`Invalid ${idParam}`), { statusCode: 400, statusMessage: `Invalid ${idParam}` });
    }

    if (!VALID_SIZES.has(size)) {
      throw Object.assign(new Error("Invalid size"), { statusCode: 400, statusMessage: "Invalid size" });
    }

    const filePath = path.join(deps.coverCacheDir, id, `${size}.webp`);

    if (!deps.existsSync(filePath)) {
      deps.setResponseHeader(event, "Content-Type", "image/svg+xml");
      deps.setResponseHeader(event, "Cache-Control", "no-cache");
      return PLACEHOLDER_SVG;
    }

    deps.setResponseHeader(event, "Content-Type", "image/webp");
    deps.setResponseHeader(event, "Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

    return deps.sendStream(event, deps.createReadStream(filePath));
  };
}
