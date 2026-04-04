/** Edition data needed to render an OPDS catalog entry. */
export interface OpdsEditionData {
  editionId: string;
  workId: string;
  titleDisplay: string;
  sortTitle: string | null;
  description: string | null;
  coverPath: string | null;
  publisher: string | null;
  publishedAt: Date | null;
  isbn13: string | null;
  language: string | null;
  seriesName: string | null;
  seriesPosition: number | null;
  updatedAt: Date;
  contributors: Array<{ name: string; role: string }>;
  files: Array<{
    editionFileId: string;
    mimeType: string | null;
    sizeBytes: bigint | null;
    basename: string;
  }>;
}

/** Options passed to all feed/entry builders. */
export interface OpdsBuildOptions {
  baseUrl: string;
  selfHref: string;
}

/** Pagination state for acquisition feeds. */
export interface OpdsPagination {
  page: number;
  perPage: number;
  totalResults: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/** A single item in a navigation feed. */
export interface OpdsNavigationItem {
  title: string;
  href: string;
  count?: number;
  updatedAt: Date;
}
