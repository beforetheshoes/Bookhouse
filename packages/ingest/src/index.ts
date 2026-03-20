export {
  canonicalizeBookTitle,
  canonicalizeContributorName,
  canonicalizeContributorNames,
  classifyMediaKind,
  createIdentifierMap,
  deriveFormatFamily,
  detectDuplicates,
  getFileExtension,
  hashFileContents,
  hashFileAsset,
  isFileChanged,
  matchFileAssetToEdition,
  normalizeAudiobookMetadata,
  normalizeBookMetadata,
  normalizeOpfMetadata,
  normalizeRelativePath,
  normalizeRootPath,
  parseAudiobookMetadataJson,
  parseAudioId3Tags,
  parseEpubMetadata,
  parseFileAssetMetadata,
  parseOpfSidecar,
  scanLibraryRoot,
  walkRegularFiles,
  createIngestServices,
} from "./services";

export type {
  DetectDuplicatesInput,
  DetectDuplicatesResult,
  HashFileAssetInput,
  HashFileAssetResult,
  IngestDb,
  IngestDependencies,
  MatchFileAssetToEditionInput,
  MatchFileAssetToEditionResult,
  NormalizedBookMetadata,
  ParsedAudiobookMetadataJsonRaw,
  ParsedAudioId3TagsRaw,
  ParsedEpubMetadataRaw,
  ParsedOpfMetadataRaw,
  ParseFileAssetMetadataInput,
  ParseFileAssetMetadataResult,
  ScanLibraryRootInput,
  ScanLibraryRootResult,
  ScanProgressData,
} from "./services";

export { extractEpubCover } from "./epub";
export type { EpubCoverResult } from "./epub";
export { detectAdjacentCover, resizeCoverImage, processCoverForWork, processCoverForWorkDefault } from "./covers";
export type { CoverDependencies, ProcessCoverInput, ProcessCoverResult } from "./covers";
export { PARTIAL_HASH_BYTES } from "./hashing";
export { SCAN_PROGRESS_INTERVAL } from "./services";

export { searchOpenLibrary, getOpenLibraryEdition, getOpenLibraryWork } from "./enrichment/open-library";
export type { OLSearchResult, OLEdition, OLWork } from "./enrichment/open-library";
export { RateLimiter } from "./enrichment/rate-limiter";
export type { RateLimitResult } from "./enrichment/rate-limiter";
export { enrichWork } from "./enrichment/enrich-work";
export type { EnrichWorkDeps, EnrichWorkResult } from "./enrichment/enrich-work";
export { levenshteinDistance, normalizedSimilarity } from "./similarity";

export const INGEST_PUBLIC_API = [
  "enrichWork",
  "classifyMediaKind",
  "createIdentifierMap",
  "createIngestServices",
  "deriveFormatFamily",
  "detectAdjacentCover",
  "detectDuplicates",
  "extractEpubCover",
  "canonicalizeBookTitle",
  "canonicalizeContributorName",
  "canonicalizeContributorNames",
  "getFileExtension",
  "getOpenLibraryEdition",
  "getOpenLibraryWork",
  "hashFileAsset",
  "hashFileContents",
  "levenshteinDistance",
  "isFileChanged",
  "matchFileAssetToEdition",
  "normalizedSimilarity",
  "normalizeAudiobookMetadata",
  "normalizeBookMetadata",
  "normalizeOpfMetadata",
  "normalizeRelativePath",
  "normalizeRootPath",
  "parseAudiobookMetadataJson",
  "parseAudioId3Tags",
  "parseEpubMetadata",
  "parseFileAssetMetadata",
  "parseOpfSidecar",
  "processCoverForWork",
  "processCoverForWorkDefault",
  "resizeCoverImage",
  "searchOpenLibrary",
  "scanLibraryRoot",
  "walkRegularFiles",
] as const;
