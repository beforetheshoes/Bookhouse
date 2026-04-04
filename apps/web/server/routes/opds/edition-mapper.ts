import type { OpdsEditionData } from "@bookhouse/opds";

/** Raw Prisma result shape from edition queries with includes. */
export interface EditionQueryResult {
  id: string;
  workId: string;
  publisher: string | null;
  publishedAt: Date | null;
  isbn13: string | null;
  language: string | null;
  updatedAt: Date;
  work: {
    titleDisplay: string;
    sortTitle: string | null;
    description: string | null;
    coverPath: string | null;
    seriesPosition: number | null;
    series: { name: string } | null;
  };
  contributors: Array<{
    role: string;
    contributor: { nameDisplay: string };
  }>;
  editionFiles: Array<{
    id: string;
    fileAsset: {
      mimeType: string | null;
      sizeBytes: bigint | null;
      basename: string;
    };
  }>;
}

/** Map a Prisma edition result to the OpdsEditionData interface. */
export function mapEditionToOpds(edition: EditionQueryResult): OpdsEditionData {
  return {
    editionId: edition.id,
    workId: edition.workId,
    titleDisplay: edition.work.titleDisplay,
    sortTitle: edition.work.sortTitle,
    description: edition.work.description,
    coverPath: edition.work.coverPath,
    publisher: edition.publisher,
    publishedAt: edition.publishedAt,
    isbn13: edition.isbn13,
    language: edition.language,
    seriesName: edition.work.series?.name ?? null,
    seriesPosition: edition.work.seriesPosition,
    updatedAt: edition.updatedAt,
    contributors: edition.contributors.map((c) => ({
      name: c.contributor.nameDisplay,
      role: c.role,
    })),
    files: edition.editionFiles.map((ef) => ({
      editionFileId: ef.id,
      mimeType: ef.fileAsset.mimeType ?? "application/epub+zip",
      sizeBytes: ef.fileAsset.sizeBytes,
      basename: ef.fileAsset.basename,
    })),
  };
}
