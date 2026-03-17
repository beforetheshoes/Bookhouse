export {
  AvailabilityStatus,
  ContributorRole,
  EditionFileRole,
  FormatFamily,
  LibraryRootKind,
  MediaKind,
  ScanMode,
} from "@bookhouse/db";

export type {
  Contributor,
  Edition,
  EditionFile,
  FileAsset,
  LibraryRoot,
  Series,
  Work,
} from "@bookhouse/db";

import type {
  Contributor,
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
}

export const BATCH1_DOMAIN_MODEL_NAMES = [
  "LibraryRoot",
  "FileAsset",
  "Work",
  "Edition",
  "EditionFile",
  "Contributor",
  "Series",
] as const;
