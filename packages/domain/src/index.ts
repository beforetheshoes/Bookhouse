export {
  AvailabilityStatus,
  ContributorRole,
  DuplicateReason,
  EditionFileRole,
  FormatFamily,
  ImportJobKind,
  ImportJobStatus,
  LibraryRootKind,
  MediaKind,
  ReviewStatus,
  ScanMode,
} from "@bookhouse/db";

export type {
  Contributor,
  DuplicateCandidate,
  Edition,
  EditionFile,
  FileAsset,
  ImportJob,
  LibraryRoot,
  Series,
  Work,
} from "@bookhouse/db";

import type {
  Contributor,
  DuplicateCandidate,
  Edition,
  EditionFile,
  FileAsset,
  LibraryRoot,
  Series,
  Work,
} from "@bookhouse/db";

export interface Batch1DomainModels {
  libraryRoot: LibraryRoot;
  fileAsset: FileAsset;
  work: Work;
  edition: Edition;
  editionFile: EditionFile;
  contributor: Contributor;
  series: Series;
  duplicateCandidate: DuplicateCandidate;
}

export const BATCH1_DOMAIN_MODEL_NAMES = [
  "LibraryRoot",
  "FileAsset",
  "Work",
  "Edition",
  "EditionFile",
  "Contributor",
  "Series",
  "DuplicateCandidate",
] as const;
