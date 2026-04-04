const METADATA_SOURCE_PRIORITY = new Map<string, number>([
  ["EPUB", 0],
  ["KEPUB", 1],
  ["AZW3", 2],
  ["AZW", 3],
  ["MOBI", 4],
  ["PDF", 5],
]);

const KOBO_DELIVERY_PRIORITY = new Map<string, number>([
  ["KEPUB", 0],
  ["EPUB", 1],
]);

export interface SelectableEditionFile {
  fileAsset: {
    basename: string;
    mediaKind: string;
  };
  id?: string;
  role?: string;
}

function compareCandidatePriority(
  a: SelectableEditionFile,
  b: SelectableEditionFile,
  priorityMap: ReadonlyMap<string, number>,
): number {
  const aPriority = priorityMap.get(a.fileAsset.mediaKind) as number;
  const bPriority = priorityMap.get(b.fileAsset.mediaKind) as number;

  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  if (a.role === "PRIMARY" && b.role !== "PRIMARY") {
    return -1;
  }

  if (b.role === "PRIMARY" && a.role !== "PRIMARY") {
    return 1;
  }

  return a.fileAsset.basename.localeCompare(b.fileAsset.basename);
}

export function isMetadataSourceMediaKind(mediaKind: string): boolean {
  return METADATA_SOURCE_PRIORITY.has(mediaKind);
}

export function isKoboDeliveryMediaKind(mediaKind: string): boolean {
  return KOBO_DELIVERY_PRIORITY.has(mediaKind);
}

export function selectPreferredMetadataSourceFile<T extends SelectableEditionFile>(
  editionFiles: readonly T[],
): T | null {
  const candidates = editionFiles.filter((editionFile) =>
    isMetadataSourceMediaKind(editionFile.fileAsset.mediaKind),
  );

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((a, b) =>
    compareCandidatePriority(a, b, METADATA_SOURCE_PRIORITY),
  )[0] as T;
}

export function selectPreferredKoboDeliveryFile<T extends SelectableEditionFile>(
  editionFiles: readonly T[],
): T | null {
  const candidates = editionFiles.filter((editionFile) =>
    isKoboDeliveryMediaKind(editionFile.fileAsset.mediaKind),
  );

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((a, b) =>
    compareCandidatePriority(a, b, KOBO_DELIVERY_PRIORITY),
  )[0] as T;
}
