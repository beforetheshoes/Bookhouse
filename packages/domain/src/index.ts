export {
  AudioLinkMatchType,
  AvailabilityStatus,
  ContributorRole,
  DuplicateReason,
  EditionFileRole,
  FormatFamily,
  LibraryRootKind,
  MediaKind,
  ProgressKind,
  ProgressTrackingMode,
  ReviewStatus,
  ScanMode,
} from "@bookhouse/db";

export type {
  AudioLink,
  Contributor,
  DuplicateCandidate,
  Edition,
  EditionFile,
  FileAsset,
  LibraryRoot,
  ReadingProgress,
  Series,
  UserPreference,
  Work,
  WorkProgressPreference,
} from "@bookhouse/db";

import type {
  AudioLink,
  Contributor,
  DuplicateCandidate,
  Edition,
  EditionFile,
  FileAsset,
  LibraryRoot,
  ReadingProgress,
  Series,
  UserPreference,
  Work,
  WorkProgressPreference,
} from "@bookhouse/db";

export interface Batch1DomainModels {
  audioLink: AudioLink;
  libraryRoot: LibraryRoot;
  fileAsset: FileAsset;
  work: Work;
  edition: Edition;
  editionFile: EditionFile;
  contributor: Contributor;
  series: Series;
  duplicateCandidate: DuplicateCandidate;
  readingProgress: ReadingProgress;
  userPreference: UserPreference;
  workProgressPreference: WorkProgressPreference;
}

export const BATCH1_DOMAIN_MODEL_NAMES = [
  "AudioLink",
  "LibraryRoot",
  "FileAsset",
  "Work",
  "Edition",
  "EditionFile",
  "Contributor",
  "Series",
  "DuplicateCandidate",
  "ReadingProgress",
  "UserPreference",
  "WorkProgressPreference",
] as const;
