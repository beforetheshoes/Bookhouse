import type {
  AudioLink,
  Collection,
  CollectionItem,
  Contributor,
  DuplicateCandidate,
  Edition,
  EditionFile,
  ExternalLink,
  FileAsset,
  LibraryRoot,
  ReadingProgress,
  Series,
  UserPreference,
  Work,
  WorkProgressPreference,
} from "@bookhouse/db";

export const AudioLinkMatchType = {
  SAME_WORK: "SAME_WORK",
  EXACT_METADATA: "EXACT_METADATA",
} as const;

export const AvailabilityStatus = {
  PRESENT: "PRESENT",
  MISSING: "MISSING",
  IGNORED: "IGNORED",
} as const;

export const ContributorRole = {
  AUTHOR: "AUTHOR",
  NARRATOR: "NARRATOR",
  EDITOR: "EDITOR",
  TRANSLATOR: "TRANSLATOR",
  ILLUSTRATOR: "ILLUSTRATOR",
  OTHER: "OTHER",
} as const;

export const DuplicateReason = {
  SAME_HASH: "SAME_HASH",
  SAME_ISBN: "SAME_ISBN",
  SIMILAR_TITLE_AUTHOR: "SIMILAR_TITLE_AUTHOR",
  SAME_PATH_PATTERN: "SAME_PATH_PATTERN",
} as const;

export const EditionFileRole = {
  PRIMARY: "PRIMARY",
  ALTERNATE_FORMAT: "ALTERNATE_FORMAT",
  SUPPLEMENT: "SUPPLEMENT",
  AUDIO_TRACK: "AUDIO_TRACK",
} as const;

export const FormatFamily = {
  EBOOK: "EBOOK",
  AUDIOBOOK: "AUDIOBOOK",
} as const;

export const LibraryRootKind = {
  EBOOKS: "EBOOKS",
  AUDIOBOOKS: "AUDIOBOOKS",
  MIXED: "MIXED",
} as const;

export const MediaKind = {
  EPUB: "EPUB",
  PDF: "PDF",
  CBZ: "CBZ",
  AUDIO: "AUDIO",
  COVER: "COVER",
  SIDECAR: "SIDECAR",
  OTHER: "OTHER",
} as const;

export const ProgressKind = {
  EBOOK: "EBOOK",
  AUDIO: "AUDIO",
  READALOUD: "READALOUD",
} as const;

export const ProgressTrackingMode = {
  BY_EDITION: "BY_EDITION",
  BY_WORK: "BY_WORK",
} as const;

export const ReviewStatus = {
  PENDING: "PENDING",
  IGNORED: "IGNORED",
  CONFIRMED: "CONFIRMED",
  MERGED: "MERGED",
} as const;

export const ScanMode = {
  FULL: "FULL",
  INCREMENTAL: "INCREMENTAL",
} as const;

export type AudioLinkMatchType = (typeof AudioLinkMatchType)[keyof typeof AudioLinkMatchType];
export type AvailabilityStatus = (typeof AvailabilityStatus)[keyof typeof AvailabilityStatus];
export type ContributorRole = (typeof ContributorRole)[keyof typeof ContributorRole];
export type DuplicateReason = (typeof DuplicateReason)[keyof typeof DuplicateReason];
export type EditionFileRole = (typeof EditionFileRole)[keyof typeof EditionFileRole];
export type FormatFamily = (typeof FormatFamily)[keyof typeof FormatFamily];
export type LibraryRootKind = (typeof LibraryRootKind)[keyof typeof LibraryRootKind];
export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];
export type ProgressKind = (typeof ProgressKind)[keyof typeof ProgressKind];
export type ProgressTrackingMode = (typeof ProgressTrackingMode)[keyof typeof ProgressTrackingMode];
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];
export type ScanMode = (typeof ScanMode)[keyof typeof ScanMode];

export type {
  AudioLink,
  Collection,
  CollectionItem,
  Contributor,
  DuplicateCandidate,
  Edition,
  EditionFile,
  ExternalLink,
  FileAsset,
  LibraryRoot,
  ReadingProgress,
  Series,
  UserPreference,
  Work,
  WorkProgressPreference,
};

export interface Batch1DomainModels {
  audioLink: AudioLink;
  externalLink: ExternalLink;
  libraryRoot: LibraryRoot;
  fileAsset: FileAsset;
  work: Work;
  edition: Edition;
  editionFile: EditionFile;
  contributor: Contributor;
  series: Series;
  collection: Collection;
  collectionItem: CollectionItem;
  duplicateCandidate: DuplicateCandidate;
  readingProgress: ReadingProgress;
  userPreference: UserPreference;
  workProgressPreference: WorkProgressPreference;
}

export const BATCH1_DOMAIN_MODEL_NAMES = [
  "AudioLink",
  "ExternalLink",
  "LibraryRoot",
  "FileAsset",
  "Work",
  "Edition",
  "EditionFile",
  "Contributor",
  "Series",
  "Collection",
  "CollectionItem",
  "DuplicateCandidate",
  "ReadingProgress",
  "UserPreference",
  "WorkProgressPreference",
] as const;
