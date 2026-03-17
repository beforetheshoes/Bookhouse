export {
  classifyMediaKind,
  createIdentifierMap,
  getFileExtension,
  hashFileContents,
  hashFileAsset,
  isFileChanged,
  normalizeBookMetadata,
  normalizeRelativePath,
  normalizeRootPath,
  parseEpubMetadata,
  parseFileAssetMetadata,
  scanLibraryRoot,
  walkRegularFiles,
  createIngestServices,
} from "./services";

export type {
  HashFileAssetInput,
  HashFileAssetResult,
  IngestDb,
  IngestDependencies,
  NormalizedBookMetadata,
  ParseFileAssetMetadataInput,
  ParseFileAssetMetadataResult,
  ParsedEpubMetadataRaw,
  ScanLibraryRootInput,
  ScanLibraryRootResult,
} from "./services";

export { PARTIAL_HASH_BYTES } from "./hashing";

export const INGEST_PUBLIC_API = [
  "classifyMediaKind",
  "createIdentifierMap",
  "createIngestServices",
  "getFileExtension",
  "hashFileAsset",
  "hashFileContents",
  "isFileChanged",
  "normalizeBookMetadata",
  "normalizeRelativePath",
  "normalizeRootPath",
  "parseEpubMetadata",
  "parseFileAssetMetadata",
  "scanLibraryRoot",
  "walkRegularFiles",
] as const;
