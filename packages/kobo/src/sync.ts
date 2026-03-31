import type { EligibleEdition, SyncResult } from "./types";
import { buildEntitlement } from "./metadata";
import type { MetadataOptions } from "./metadata";

export interface SyncedBookRecord {
  editionId: string;
  removedAt: Date | null;
}

export interface FindEligibleEditionsDeps {
  getDeviceCollectionEditions: (deviceId: string) => Promise<EligibleEdition[]>;
}

export async function findEligibleEditions(
  deviceId: string,
  deps: FindEligibleEditionsDeps,
): Promise<EligibleEdition[]> {
  return deps.getDeviceCollectionEditions(deviceId);
}

export function computeSyncDiff(
  eligible: EligibleEdition[],
  synced: SyncedBookRecord[],
): { toAdd: EligibleEdition[]; toRemove: string[] } {
  const eligibleIds = new Set(eligible.map((e) => e.id));
  const syncedActiveIds = new Set(
    synced.filter((s) => s.removedAt === null).map((s) => s.editionId),
  );

  const toAdd = eligible.filter((e) => !syncedActiveIds.has(e.id));
  const toRemove = synced
    .filter((s) => s.removedAt === null && !eligibleIds.has(s.editionId))
    .map((s) => s.editionId);

  return { toAdd, toRemove };
}

export function buildSyncResponse(
  toAdd: EligibleEdition[],
  toRemove: string[],
  options: MetadataOptions,
): SyncResult {
  const newEntitlements = toAdd.map((edition) =>
    buildEntitlement(edition, options),
  );

  return {
    newEntitlements,
    removedIds: toRemove,
  };
}
