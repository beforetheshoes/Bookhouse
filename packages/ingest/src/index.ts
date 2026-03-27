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
  matchSuggestions,
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
  MatchSuggestionsInput,
  MatchSuggestionsResult,
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
export { searchGoogleBooks, getGoogleBooksVolume } from "./enrichment/google-books";
export type { GBVolume } from "./enrichment/google-books";
export { searchHardcover, getHardcoverBook } from "./enrichment/hardcover";
export type { HCBook } from "./enrichment/hardcover";
export { searchAllSources } from "./enrichment/search-sources";
export type {
  EnrichmentProvider,
  EnrichmentWorkData,
  EnrichmentEditionData,
  SourceResult,
  SearchSourcesResult,
  SearchSourcesDeps,
} from "./enrichment/search-sources";
export { extractDominantColors } from "./cover-colors";
export { VALID_WORK_ID, MAX_FILE_SIZE, ALLOWED_MIME_TYPES, IMAGE_SIGNATURES, isValidImageData, isAllowedMimeType } from "./cover-validation";
export { applyCoverFromUrl } from "./cover-from-url";
export type { CoverFromUrlDeps, CoverFromUrlDbDeps, CoverFromUrlInput, CoverFromUrlResult } from "./cover-from-url";
export { RateLimiter } from "./enrichment/rate-limiter";
export type { RateLimitResult } from "./enrichment/rate-limiter";
export { enrichWork } from "./enrichment/enrich-work";
export type { EnrichWorkDeps, EnrichWorkResult } from "./enrichment/enrich-work";
export { levenshteinDistance, normalizedSimilarity, normalizeForTitleMatching, stripSubtitleForMatching } from "./similarity";
export { cascadeCleanupOrphans } from "./cascade-cleanup";
export type { CascadeCleanupInput, CascadeCleanupResult } from "./cascade-cleanup";

export const INGEST_PUBLIC_API = [
  "enrichWork",
  "getGoogleBooksVolume",
  "getHardcoverBook",
  "searchAllSources",
  "searchGoogleBooks",
  "searchHardcover",
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
  "matchSuggestions",
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
  "VALID_WORK_ID",
  "MAX_FILE_SIZE",
  "ALLOWED_MIME_TYPES",
  "IMAGE_SIGNATURES",
  "isValidImageData",
  "isAllowedMimeType",
  "applyCoverFromUrl",
] as const;
