export {
  generateAuthToken,
  generateUserKey,
  validateAuthToken,
  authenticateDevice,
  AuthError,
} from "./auth";

export type { AuthenticateDeviceDeps, DeviceLookupResult } from "./auth";

export {
  encodeSyncToken,
  decodeSyncToken,
  createInitialSyncToken,
} from "./sync-token";

export {
  buildEntitlement,
  buildBookMetadata,
  buildContentUrls,
  toKoboId,
} from "./metadata";

export type { MetadataOptions } from "./metadata";

export {
  findEligibleEditions,
  computeSyncDiff,
  buildSyncResponse,
} from "./sync";

export type { SyncedBookRecord, FindEligibleEditionsDeps } from "./sync";

export { getKepubCachePath, convertToKepub } from "./kepub";

export type { KepubConvertDeps } from "./kepub";

export type {
  KoboEntitlement,
  KoboBookMetadata,
  KoboContributorRole,
  KoboDownloadUrl,
  KoboContentUrls,
  SyncToken,
  SyncResult,
  EligibleEdition,
} from "./types";
