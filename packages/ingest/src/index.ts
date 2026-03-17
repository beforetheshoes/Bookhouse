export {
  classifyMediaKind,
  getFileExtension,
  hashFileContents,
  hashFileAsset,
  isFileChanged,
  normalizeRelativePath,
  normalizeRootPath,
  scanLibraryRoot,
  walkRegularFiles,
  createIngestServices,
} from "./services";

export type {
  HashFileAssetInput,
  HashFileAssetResult,
  IngestDb,
  IngestDependencies,
  ScanLibraryRootInput,
  ScanLibraryRootResult,
} from "./services";

export { PARTIAL_HASH_BYTES } from "./hashing";

export const INGEST_PUBLIC_API = [
  "classifyMediaKind",
  "createIngestServices",
  "getFileExtension",
  "hashFileAsset",
  "hashFileContents",
  "isFileChanged",
  "normalizeRelativePath",
  "normalizeRootPath",
  "scanLibraryRoot",
  "walkRegularFiles",
] as const;
