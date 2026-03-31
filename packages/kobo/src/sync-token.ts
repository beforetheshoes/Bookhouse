import type { SyncToken } from "./types";

const SYNC_TOKEN_PREFIX = "kobo-sync-";

export function encodeSyncToken(token: SyncToken): string {
  const json = JSON.stringify(token);
  return SYNC_TOKEN_PREFIX + Buffer.from(json).toString("base64url");
}

export function decodeSyncToken(encoded: string): SyncToken | null {
  if (!encoded.startsWith(SYNC_TOKEN_PREFIX)) {
    return null;
  }

  try {
    const base64 = encoded.slice(SYNC_TOKEN_PREFIX.length);
    const json = Buffer.from(base64, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as Record<string, string | boolean>;

    if (typeof parsed.lastSyncAt !== "string" || typeof parsed.archive !== "boolean") {
      return null;
    }

    return { lastSyncAt: parsed.lastSyncAt, archive: parsed.archive };
  } catch {
    return null;
  }
}

export function createInitialSyncToken(): SyncToken {
  return {
    lastSyncAt: new Date(0).toISOString(),
    archive: false,
  };
}
