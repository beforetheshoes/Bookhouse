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
  IGNORED_BASENAMES,
  isFileChanged,
  isIgnoredBasename,
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
  IngestLogger,
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
export { detectAdjacentCover, resizeCoverImage, resizeAndSaveCover, processCoverForWork, processCoverForWorkDefault } from "./covers";
export type { CoverDependencies, ProcessCoverInput, ProcessCoverResult } from "./covers";
export { PARTIAL_HASH_BYTES } from "./hashing";
export { SCAN_PROGRESS_INTERVAL } from "./services";

export { searchOpenLibrary, getOpenLibraryEdition, getOpenLibraryWork, searchOpenLibraryAuthors, createOLFetcher } from "./enrichment/open-library";
export type { OLSearchResult, OLEdition, OLWork, OLAuthorSearchResult } from "./enrichment/open-library";
export { searchGoogleBooks, getGoogleBooksVolume } from "./enrichment/google-books";
export type { GBVolume } from "./enrichment/google-books";
export { searchHardcover, getHardcoverBook } from "./enrichment/hardcover";
export type { HCBook } from "./enrichment/hardcover";
export { searchAudible } from "./enrichment/audible";
export type { AudibleProduct } from "./enrichment/audible";
export { searchAllSources } from "./enrichment/search-sources";
export type {
  EnrichmentProvider,
  EnrichmentWorkData,
  EnrichmentEditionData,
  SourceResult,
  SearchSourcesResult,
  SearchSourcesDeps,
} from "./enrichment/search-sources";
export { extractDominantColors, extractDominantColorsDefault } from "./cover-colors";
export { VALID_WORK_ID, MAX_FILE_SIZE, ALLOWED_MIME_TYPES, IMAGE_SIGNATURES, isValidImageData, isAllowedMimeType } from "./cover-validation";
export { applyCoverFromUrl } from "./cover-from-url";
export type { CoverFromUrlDeps, CoverFromUrlDbDeps, CoverFromUrlInput, CoverFromUrlResult } from "./cover-from-url";
export { RateLimiter } from "./enrichment/rate-limiter";
export type { RateLimitResult } from "./enrichment/rate-limiter";
export { applyEnrichmentFields } from "./enrichment/apply-enrichment";
export type { ApplyEnrichmentInput, ApplyEnrichmentDeps, ApplyEnrichmentResult, ApplyFieldValue } from "./enrichment/apply-enrichment";
export { processBulkEnrichWork } from "./enrichment/bulk-enrich";
export type { BulkEnrichDeps, BulkEnrichResult, BulkEnrichWorkData, BulkEnrichEditionData } from "./enrichment/bulk-enrich";
export { enrichWork } from "./enrichment/enrich-work";
export type { EnrichWorkDeps, EnrichWorkResult } from "./enrichment/enrich-work";
export { enrichContributor } from "./enrichment/enrich-contributor";
export type { EnrichContributorDeps, EnrichContributorResult } from "./enrichment/enrich-contributor";
export { TokenBucketLimiter } from "./enrichment/token-bucket";
export { searchHardcoverAuthors } from "./enrichment/hardcover";
export type { HCAuthor } from "./enrichment/hardcover";
export { searchWikidataAuthors, buildWikimediaThumbUrl } from "./enrichment/wikidata";
export type { WDAuthor } from "./enrichment/wikidata";
export { applyAuthorPhotoFromUrl } from "./author-photo";
export type { AuthorPhotoDeps, AuthorPhotoDbDeps, AuthorPhotoInput, AuthorPhotoResult } from "./author-photo";
export { levenshteinDistance, normalizedSimilarity, normalizeForTitleMatching, stripSubtitleForMatching } from "./similarity";
export { cascadeCleanupOrphans, cleanupOrphanedFileAssets } from "./cascade-cleanup";
export type { CascadeCleanupInput, CascadeCleanupResult } from "./cascade-cleanup";