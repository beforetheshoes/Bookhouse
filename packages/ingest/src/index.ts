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
  matchAudio,
  matchFileAssetToEdition,
  mergeWorksById,
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
  MatchAudioInput,
  MatchAudioResult,
  HashFileAssetInput,
  HashFileAssetResult,
  IngestDb,
  IngestDependencies,
  MatchFileAssetToEditionInput,
  MatchFileAssetToEditionResult,
  NormalizedBookMetadata,
  ParseAudioId3Result,
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
export { levenshteinDistance, normalizedSimilarity, normalizeForTitleMatching, stripSubtitleForMatching } from "./similarity";
export { cascadeCleanupOrphans } from "./cascade-cleanup";
export type { CascadeCleanupInput, CascadeCleanupResult } from "./cascade-cleanup";

export const INGEST_PUBLIC_API = [
  "enrichWork",
  "classifyMediaKind",
  "createIdentifierMap",
  "createIngestServices",
  "deriveFormatFamily",
  "detectAdjacentCover",
  "detectDuplicates",
  "extractEpubCover",
  "cascadeCleanupOrphans",
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
  "matchAudio",
  "matchFileAssetToEdition",
  "mergeWorksById",
  "normalizedSimilarity",
  "normalizeForTitleMatching",
  "stripSubtitleForMatching",
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
