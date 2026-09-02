// Human labels for enum values that used to be shown raw ("SAME_ISBN",
// "INCREMENTAL", "ACTIVE") in badges across the app.
export const DUPLICATE_REASON_LABELS: Record<string, string> = {
  SAME_HASH: "Identical file",
  SAME_ISBN: "Same ISBN",
  SIMILAR_TITLE_AUTHOR: "Similar title & author",
  SAME_PATH_PATTERN: "Same folder pattern",
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IGNORED: "Ignored",
  CONFIRMED: "Confirmed",
  MERGED: "Merged",
};

export const MATCH_TYPE_LABELS: Record<string, string> = {
  SAME_WORK: "Same work",
  EXACT_METADATA: "Exact metadata",
  NORMALIZED_TITLE: "Normalised title",
  SUBTITLE_STRIPPED: "Title without subtitle",
  TITLE_ONLY: "Title only",
};

export const LIBRARY_ROOT_KIND_LABELS: Record<string, string> = {
  EBOOKS: "Ebooks",
  AUDIOBOOKS: "Audiobooks",
  MIXED: "Mixed",
};

export const SCAN_MODE_LABELS: Record<string, string> = {
  FULL: "Full scan",
  INCREMENTAL: "Incremental",
};

export const KOBO_DEVICE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  REVOKED: "Revoked",
};

/** The label for a value, or the value itself for anything the map does not know. */
export function labelFor(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}
