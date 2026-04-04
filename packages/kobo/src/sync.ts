import type { EligibleEdition, ReadingProgressRecord, SyncResult } from "./types";
import { buildEntitlement } from "./metadata";
import { formatReadingState } from "./reading-state";
import type { MetadataOptions } from "./metadata";
import { isKoboDeliveryMediaKind } from "@bookhouse/shared";

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
  const editions = await deps.getDeviceCollectionEditions(deviceId);
  return editions.filter((edition) =>
    edition.deliveryFilePath !== null &&
    edition.deliveryFileMediaKind !== null &&
    isKoboDeliveryMediaKind(edition.deliveryFileMediaKind),
  );
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
  progressMap?: Map<string, ReadingProgressRecord>,
): SyncResult {
  const newEntitlements = toAdd.map((edition) =>
    buildEntitlement(edition, options, progressMap?.get(edition.id) ?? null),
  );

  // Build ChangedReadingState entries for already-synced books with progress.
  // Only include records that have a valid Location (from Kobo device);
  // manual-source records lack Location data and would confuse the device.
  // Use the current time for timestamps so the Kobo treats them as newer
  // than its local state (which uses the time of the last sync).
  const addedIds = new Set(toAdd.map((e) => e.id));
  const now = new Date();
  const changedReadingStates = [...(progressMap?.entries() ?? [])]
    .filter(([id, progress]) => !addedIds.has(id) && progress.locator.koboLocation != null)
    .map(([id, progress]) => formatReadingState({ ...progress, updatedAt: now }, id));

  return {
    newEntitlements,
    removedIds: toRemove,
    changedReadingStates,
  };
}
