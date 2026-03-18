import path from "node:path";
import {
  AudioLinkMatchType,
  DuplicateReason,
  FormatFamily,
  ProgressTrackingMode,
  ReviewStatus,
  type ContributorRole,
  type ProgressKind,
} from "@bookhouse/domain";

type EditionContributorWithContributor = {
  contributor: {
    nameDisplay: string;
  };
  role: ContributorRole;
};

type EditionWithDetails = {
  asin: string | null;
  contributors: EditionContributorWithContributor[];
  createdAt?: Date;
  editionFiles: Array<{
    fileAsset: {
      absolutePath: string;
      createdAt?: Date;
      fullHash: string | null;
      id: string;
      relativePath: string;
      updatedAt?: Date;
    };
  }>;
  formatFamily: FormatFamily;
  id: string;
  isbn10: string | null;
  isbn13: string | null;
  publishedAt: Date | null;
  publisher: string | null;
  updatedAt?: Date;
  work: {
    id: string;
    titleDisplay: string;
  };
};

type FileAssetWithDetails = {
  absolutePath: string;
  createdAt?: Date;
  fullHash: string | null;
  id: string;
  relativePath: string;
  updatedAt?: Date;
};

type DuplicateCandidateWithDetails = {
  confidence: number | null;
  id: string;
  leftEdition: EditionWithDetails | null;
  leftEditionId: string | null;
  leftFileAsset: FileAssetWithDetails | null;
  leftFileAssetId: string | null;
  reason: DuplicateReason;
  rightEdition: EditionWithDetails | null;
  rightEditionId: string | null;
  rightFileAsset: FileAssetWithDetails | null;
  rightFileAssetId: string | null;
  status: ReviewStatus;
};

type AudioLinkRecord = {
  audioEdition?: EditionWithDetails | null;
  audioEditionId: string;
  confidence: number | null;
  ebookEdition?: EditionWithDetails | null;
  ebookEditionId: string;
  id: string;
  matchType: AudioLinkMatchType;
  reviewStatus: ReviewStatus;
};

type ReadingProgressWithEdition = {
  edition: {
    formatFamily: FormatFamily;
    id: string;
    work: {
      id: string;
      titleDisplay: string;
    };
  };
  editionId: string;
  id: string;
  locator: unknown;
  percent: number | null;
  progressKind: ProgressKind;
  source: string | null;
  updatedAt: Date;
  userId: string;
};

export interface LibraryServiceDb {
  audioLink: {
    create(args: Record<string, unknown>): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
    findMany(args: Record<string, unknown>): Promise<AudioLinkRecord[]>;
    findUnique(args: Record<string, unknown>): Promise<AudioLinkRecord | null>;
    update(args: Record<string, unknown>): Promise<AudioLinkRecord>;
  };
  collectionItem: {
    create(args: Record<string, unknown>): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
    findMany(args: Record<string, unknown>): Promise<Array<{ collectionId: string; editionId: string; id: string }>>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  duplicateCandidate: {
    findMany(args: Record<string, unknown>): Promise<DuplicateCandidateWithDetails[]>;
    findUnique(args: Record<string, unknown>): Promise<DuplicateCandidateWithDetails | null>;
    update(args: Record<string, unknown>): Promise<DuplicateCandidateWithDetails>;
  };
  edition: {
    delete(args: { where: { id: string } }): Promise<unknown>;
    findUnique(args: Record<string, unknown>): Promise<EditionWithDetails | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<EditionWithDetails>;
  };
  editionContributor: {
    create(args: Record<string, unknown>): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
    findMany(args: Record<string, unknown>): Promise<Array<{ contributorId: string; editionId: string; id: string; role: ContributorRole }>>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  editionFile: {
    create(args: Record<string, unknown>): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
    findMany(args: Record<string, unknown>): Promise<Array<{ editionId: string; fileAssetId: string; id: string; role: string }>>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  externalLink: {
    create(args: Record<string, unknown>): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
    findMany(args: Record<string, unknown>): Promise<Array<{ editionId: string; externalId: string; id: string; metadata: unknown; provider: string }>>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  readingProgress: {
    create(args: Record<string, unknown>): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    findMany(args: Record<string, unknown>): Promise<ReadingProgressWithEdition[]>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  userPreference: {
    findUnique(args: Record<string, unknown>): Promise<{ progressTrackingMode: ProgressTrackingMode; userId: string } | null>;
    upsert(args: Record<string, unknown>): Promise<{ progressTrackingMode: ProgressTrackingMode; userId: string }>;
  };
  work: {
    delete(args: { where: { id: string } }): Promise<unknown>;
    findUnique(args: Record<string, unknown>): Promise<{ id: string; titleDisplay: string; editions?: unknown[] } | null>;
  };
  workProgressPreference: {
    deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
    findUnique(args: Record<string, unknown>): Promise<{ progressTrackingMode: ProgressTrackingMode; userId: string; workId: string } | null>;
    upsert(args: Record<string, unknown>): Promise<{ progressTrackingMode: ProgressTrackingMode; userId: string; workId: string }>;
  };
}

export interface ListDuplicateCandidatesInput {
  reason?: DuplicateReason | "ALL";
  status?: ReviewStatus | "ALL";
}

export interface DuplicateCandidateSummary {
  confidence: number | null;
  id: string;
  leftLabel: string;
  leftWorkId?: string;
  reason: DuplicateReason;
  rightLabel: string;
  rightWorkId?: string;
  status: ReviewStatus;
}

export interface DuplicateCandidateDetail extends DuplicateCandidateSummary {
  leftAuthors: string[];
  leftCreatedAt?: string;
  leftFileCount: number;
  leftHashes: string[];
  leftIsbns: string[];
  leftPaths: string[];
  leftUpdatedAt?: string;
  rightAuthors: string[];
  rightCreatedAt?: string;
  rightFileCount: number;
  rightHashes: string[];
  rightIsbns: string[];
  rightPaths: string[];
  rightUpdatedAt?: string;
  mergeable: boolean;
}

export interface ListAudioLinksInput {
  status?: ReviewStatus | "ALL";
}

export interface AudioLinkSummary {
  audioLabel: string;
  audioWorkId: string;
  confidence: number | null;
  ebookLabel: string;
  ebookWorkId: string;
  id: string;
  matchType: AudioLinkMatchType;
  reviewStatus: ReviewStatus;
}

export interface AudioLinkDetail extends AudioLinkSummary {
  audioAuthors: string[];
  audioCreatedAt?: string;
  audioFileCount: number;
  audioHashes: string[];
  audioIsbns: string[];
  audioPaths: string[];
  audioUpdatedAt?: string;
  ebookAuthors: string[];
  ebookCreatedAt?: string;
  ebookFileCount: number;
  ebookHashes: string[];
  ebookIsbns: string[];
  ebookPaths: string[];
  ebookUpdatedAt?: string;
}

export interface WorkProgressView {
  currentSourceEditionId?: string;
  effectiveMode: ProgressTrackingMode;
  globalMode: ProgressTrackingMode;
  overrideMode: ProgressTrackingMode | null;
  progressRows: Array<{
    editionId: string;
    formatFamily: FormatFamily;
    id: string;
    locator: Record<string, object>;
    percent: number | null;
    progressKind: ProgressKind;
    source: string | null;
    updatedAt: string;
  }>;
  summary: {
    percent: number | null;
    progressKind: ProgressKind;
    source: string | null;
    updatedAt: string;
  } | null;
  workId: string;
  workTitle: string;
}

const EDITION_DETAIL_INCLUDE = {
  contributors: {
    include: {
      contributor: true,
    },
  },
  editionFiles: {
    include: {
      fileAsset: true,
    },
  },
  work: true,
} as const;

function getEditionAuthors(edition: EditionWithDetails | null): string[] {
  return (edition?.contributors ?? [])
    .filter((contributor) => contributor.role === "AUTHOR")
    .map((contributor) => contributor.contributor.nameDisplay);
}

function getEditionPaths(edition: EditionWithDetails): string[] {
  return edition.editionFiles.map((editionFile) => editionFile.fileAsset.relativePath);
}

function getEditionHashes(edition: EditionWithDetails): string[] {
  return [...new Set(
    edition.editionFiles
      .map((editionFile) => editionFile.fileAsset.fullHash)
      .filter((hash): hash is string => hash !== null),
  )];
}

function getEditionIsbns(edition: EditionWithDetails | null): string[] {
  return [edition?.isbn13, edition?.isbn10].filter((isbn): isbn is string => Boolean(isbn));
}

function formatSideLabel(candidateSide: EditionWithDetails | FileAssetWithDetails | null): string {
  if (candidateSide === null) {
    return "Missing";
  }

  if ("work" in candidateSide) {
    return `${candidateSide.work.titleDisplay} (${candidateSide.id})`;
  }

  return path.basename(candidateSide.absolutePath);
}

function toDuplicateCandidateSummary(candidate: DuplicateCandidateWithDetails): DuplicateCandidateSummary {
  return {
    confidence: candidate.confidence,
    id: candidate.id,
    leftLabel: formatSideLabel(candidate.leftEdition ?? candidate.leftFileAsset),
    leftWorkId: candidate.leftEdition?.work.id,
    reason: candidate.reason,
    rightLabel: formatSideLabel(candidate.rightEdition ?? candidate.rightFileAsset),
    rightWorkId: candidate.rightEdition?.work.id,
    status: candidate.status,
  };
}

export function toDuplicateCandidateDetail(candidate: DuplicateCandidateWithDetails): DuplicateCandidateDetail {
  const summary = toDuplicateCandidateSummary(candidate);
  const leftSource = candidate.leftEdition ?? candidate.leftFileAsset;
  const rightSource = candidate.rightEdition ?? candidate.rightFileAsset;

  return {
    ...summary,
    leftAuthors: getEditionAuthors(candidate.leftEdition),
    leftCreatedAt: leftSource?.createdAt?.toISOString(),
    leftFileCount: candidate.leftEdition?.editionFiles.length ?? (candidate.leftFileAsset ? 1 : 0),
    leftHashes: candidate.leftEdition ? getEditionHashes(candidate.leftEdition) : [candidate.leftFileAsset?.fullHash].filter((hash): hash is string => Boolean(hash)),
    leftIsbns: getEditionIsbns(candidate.leftEdition),
    leftPaths: candidate.leftEdition ? getEditionPaths(candidate.leftEdition) : [candidate.leftFileAsset?.relativePath].filter((pathValue): pathValue is string => Boolean(pathValue)),
    leftUpdatedAt: leftSource?.updatedAt?.toISOString(),
    mergeable:
      candidate.leftEdition !== null &&
      candidate.rightEdition !== null &&
      candidate.leftEdition.formatFamily === FormatFamily.EBOOK &&
      candidate.rightEdition.formatFamily === FormatFamily.EBOOK,
    rightAuthors: getEditionAuthors(candidate.rightEdition),
    rightCreatedAt: rightSource?.createdAt?.toISOString(),
    rightFileCount: candidate.rightEdition?.editionFiles.length ?? (candidate.rightFileAsset ? 1 : 0),
    rightHashes: candidate.rightEdition ? getEditionHashes(candidate.rightEdition) : [candidate.rightFileAsset?.fullHash].filter((hash): hash is string => Boolean(hash)),
    rightIsbns: getEditionIsbns(candidate.rightEdition),
    rightPaths: candidate.rightEdition ? getEditionPaths(candidate.rightEdition) : [candidate.rightFileAsset?.relativePath].filter((pathValue): pathValue is string => Boolean(pathValue)),
    rightUpdatedAt: rightSource?.updatedAt?.toISOString(),
  };
}

function toAudioLinkSummary(audioLink: AudioLinkRecord): AudioLinkSummary {
  if (!audioLink.ebookEdition || !audioLink.audioEdition) {
    throw new Error(`Audio link "${audioLink.id}" is missing edition details`);
  }

  return {
    audioLabel: formatSideLabel(audioLink.audioEdition),
    audioWorkId: audioLink.audioEdition.work.id,
    confidence: audioLink.confidence,
    ebookLabel: formatSideLabel(audioLink.ebookEdition),
    ebookWorkId: audioLink.ebookEdition.work.id,
    id: audioLink.id,
    matchType: audioLink.matchType,
    reviewStatus: audioLink.reviewStatus,
  };
}

export function toAudioLinkDetail(audioLink: AudioLinkRecord): AudioLinkDetail {
  if (!audioLink.ebookEdition || !audioLink.audioEdition) {
    throw new Error(`Audio link "${audioLink.id}" is missing edition details`);
  }

  const summary = toAudioLinkSummary(audioLink);

  return {
    ...summary,
    audioAuthors: getEditionAuthors(audioLink.audioEdition),
    audioCreatedAt: audioLink.audioEdition.createdAt?.toISOString(),
    audioFileCount: audioLink.audioEdition.editionFiles.length,
    audioHashes: getEditionHashes(audioLink.audioEdition),
    audioIsbns: getEditionIsbns(audioLink.audioEdition),
    audioPaths: getEditionPaths(audioLink.audioEdition),
    audioUpdatedAt: audioLink.audioEdition.updatedAt?.toISOString(),
    ebookAuthors: getEditionAuthors(audioLink.ebookEdition),
    ebookCreatedAt: audioLink.ebookEdition.createdAt?.toISOString(),
    ebookFileCount: audioLink.ebookEdition.editionFiles.length,
    ebookHashes: getEditionHashes(audioLink.ebookEdition),
    ebookIsbns: getEditionIsbns(audioLink.ebookEdition),
    ebookPaths: getEditionPaths(audioLink.ebookEdition),
    ebookUpdatedAt: audioLink.ebookEdition.updatedAt?.toISOString(),
  };
}

export async function listDuplicateCandidates(
  db: LibraryServiceDb,
  input: ListDuplicateCandidatesInput = {},
): Promise<DuplicateCandidateSummary[]> {
  const candidates = await db.duplicateCandidate.findMany({
    include: {
      leftEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
      leftFileAsset: true,
      rightEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
      rightFileAsset: true,
    },
    orderBy: [{ status: "asc" }, { reason: "asc" }, { id: "asc" }],
    where: {
      ...(input.reason && input.reason !== "ALL" ? { reason: input.reason } : {}),
      ...(input.status && input.status !== "ALL" ? { status: input.status } : {}),
    },
  });

  return candidates.map(toDuplicateCandidateSummary);
}

export async function getDuplicateCandidateDetail(
  db: LibraryServiceDb,
  candidateId: string,
): Promise<DuplicateCandidateDetail | null> {
  const candidate = await db.duplicateCandidate.findUnique({
    where: { id: candidateId },
    include: {
      leftEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
      leftFileAsset: true,
      rightEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
      rightFileAsset: true,
    },
  });

  return candidate === null ? null : toDuplicateCandidateDetail(candidate);
}

export async function updateDuplicateCandidateStatus(
  db: LibraryServiceDb,
  candidateId: string,
  status: ReviewStatus,
): Promise<DuplicateCandidateSummary> {
  const candidate = await db.duplicateCandidate.update({
    where: { id: candidateId },
    data: { status },
    include: {
      leftEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
      leftFileAsset: true,
      rightEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
      rightFileAsset: true,
    },
  });

  return toDuplicateCandidateSummary(candidate);
}

export async function listAudioLinks(
  db: LibraryServiceDb,
  input: ListAudioLinksInput = {},
): Promise<AudioLinkSummary[]> {
  const audioLinks = await db.audioLink.findMany({
    include: {
      audioEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
      ebookEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
    },
    orderBy: [{ reviewStatus: "asc" }, { matchType: "asc" }, { id: "asc" }],
    where: {
      ...(input.status && input.status !== "ALL" ? { reviewStatus: input.status } : {}),
    },
  });

  return audioLinks.map(toAudioLinkSummary);
}

export async function getAudioLinkDetail(
  db: LibraryServiceDb,
  linkId: string,
): Promise<AudioLinkDetail | null> {
  const audioLink = await db.audioLink.findUnique({
    where: { id: linkId },
    include: {
      audioEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
      ebookEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
    },
  });

  return audioLink === null ? null : toAudioLinkDetail(audioLink);
}

export async function updateAudioLinkStatus(
  db: LibraryServiceDb,
  linkId: string,
  reviewStatus: ReviewStatus,
): Promise<AudioLinkSummary> {
  const audioLink = await db.audioLink.update({
    where: { id: linkId },
    data: { reviewStatus },
    include: {
      audioEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
      ebookEdition: {
        include: EDITION_DETAIL_INCLUDE,
      },
    },
  });

  return toAudioLinkSummary(audioLink);
}

async function moveUniqueRelations(
  findMany: (editionId: string) => Promise<Array<{ id: string } & Record<string, unknown>>>,
  findExisting: (survivorId: string, row: Record<string, unknown>) => Promise<{ id: string } | null>,
  move: (rowId: string, survivorId: string) => Promise<void>,
  remove: (rowId: string) => Promise<void>,
  survivorId: string,
  losingId: string,
): Promise<void> {
  const rows = await findMany(losingId);

  for (const row of rows) {
    const existing = await findExisting(survivorId, row);

    if (existing) {
      await remove(row.id);
      continue;
    }

    await move(row.id, survivorId);
  }
}

async function mergeReadingProgress(db: LibraryServiceDb, survivorId: string, losingId: string): Promise<void> {
  const rows = await db.readingProgress.findMany({
    where: {
      editionId: {
        in: [survivorId, losingId],
      },
    },
  });
  const groups = new Map<string, ReadingProgressWithEdition[]>();

  for (const row of rows) {
    const key = [row.userId, row.progressKind, row.source ?? ""].join(":");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const sorted = [...group].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    const keeper = sorted[0]!;
    const shouldMoveKeeper = keeper.editionId !== survivorId;

    if (shouldMoveKeeper) {
      await db.readingProgress.update({
        where: { id: keeper.id },
        data: { editionId: survivorId },
      });
    }

    for (const duplicate of sorted.slice(1)) {
      await db.readingProgress.delete({
        where: { id: duplicate.id },
      });
    }
  }
}

export async function mergeDuplicateCandidate(
  db: LibraryServiceDb,
  candidateId: string,
  survivorSide: "left" | "right",
): Promise<DuplicateCandidateSummary> {
  const transactionalDb = db as LibraryServiceDb & {
    $transaction?: <TResult>(callback: (tx: LibraryServiceDb) => Promise<TResult>) => Promise<TResult>;
  };
  const transaction = transactionalDb.$transaction
    ? transactionalDb.$transaction.bind(transactionalDb)
    : async <TResult>(callback: (tx: LibraryServiceDb) => Promise<TResult>) => callback(db);

  return transaction(async (tx) => {
    const candidate = await tx.duplicateCandidate.findUnique({
      where: { id: candidateId },
      include: {
        leftEdition: {
          include: {
            contributors: {
              include: {
                contributor: true,
              },
            },
            editionFiles: {
              include: {
                fileAsset: true,
              },
            },
            work: true,
          },
        },
        leftFileAsset: true,
        rightEdition: {
          include: {
            contributors: {
              include: {
                contributor: true,
              },
            },
            editionFiles: {
              include: {
                fileAsset: true,
              },
            },
            work: true,
          },
        },
        rightFileAsset: true,
      },
    });

    if (
      candidate === null ||
      candidate.leftEdition === null ||
      candidate.rightEdition === null ||
      candidate.leftEdition.formatFamily !== FormatFamily.EBOOK ||
      candidate.rightEdition.formatFamily !== FormatFamily.EBOOK
    ) {
      throw new Error("Only edition-level ebook duplicate candidates can be merged");
    }

    const survivor = survivorSide === "left" ? candidate.leftEdition : candidate.rightEdition;
    const loser = survivorSide === "left" ? candidate.rightEdition : candidate.leftEdition;

    await tx.edition.update({
      where: { id: survivor.id },
      data: {
        asin: survivor.asin ?? loser.asin,
        isbn10: survivor.isbn10 ?? loser.isbn10,
        isbn13: survivor.isbn13 ?? loser.isbn13,
        publishedAt: survivor.publishedAt ?? loser.publishedAt,
        publisher: survivor.publisher ?? loser.publisher,
      },
    });

    await moveUniqueRelations(
      async (editionId) => tx.editionFile.findMany({ where: { editionId } }),
      async (survivorId, row) => tx.editionFile.findFirst({
        where: {
          editionId: survivorId,
          fileAssetId: row.fileAssetId,
        },
      }),
      async (rowId, survivorId) => {
        await tx.editionFile.update({ where: { id: rowId }, data: { editionId: survivorId } });
      },
      async (rowId) => {
        await tx.editionFile.delete({ where: { id: rowId } });
      },
      survivor.id,
      loser.id,
    );

    await moveUniqueRelations(
      async (editionId) => tx.editionContributor.findMany({ where: { editionId } }),
      async (survivorId, row) => tx.editionContributor.findFirst({
        where: {
          contributorId: row.contributorId,
          editionId: survivorId,
          role: row.role,
        },
      }),
      async (rowId, survivorId) => {
        await tx.editionContributor.update({ where: { id: rowId }, data: { editionId: survivorId } });
      },
      async (rowId) => {
        await tx.editionContributor.delete({ where: { id: rowId } });
      },
      survivor.id,
      loser.id,
    );

    await moveUniqueRelations(
      async (editionId) => tx.collectionItem.findMany({ where: { editionId } }),
      async (survivorId, row) => tx.collectionItem.findFirst({
        where: {
          collectionId: row.collectionId,
          editionId: survivorId,
        },
      }),
      async (rowId, survivorId) => {
        await tx.collectionItem.update({ where: { id: rowId }, data: { editionId: survivorId } });
      },
      async (rowId) => {
        await tx.collectionItem.delete({ where: { id: rowId } });
      },
      survivor.id,
      loser.id,
    );

    await mergeReadingProgress(tx, survivor.id, loser.id);

    await moveUniqueRelations(
      async (editionId) => tx.externalLink.findMany({ where: { editionId } }),
      async (survivorId, row) => tx.externalLink.findFirst({
        where: {
          editionId: survivorId,
          externalId: row.externalId,
          provider: row.provider,
        },
      }),
      async (rowId, survivorId) => {
        await tx.externalLink.update({ where: { id: rowId }, data: { editionId: survivorId } });
      },
      async (rowId) => {
        await tx.externalLink.delete({ where: { id: rowId } });
      },
      survivor.id,
      loser.id,
    );

    const audioLinks = await tx.audioLink.findMany({
      where: {
        OR: [
          { audioEditionId: loser.id },
          { ebookEditionId: loser.id },
        ],
      },
    });

    for (const audioLink of audioLinks) {
      const nextData = {
        audioEditionId: audioLink.audioEditionId === loser.id ? survivor.id : audioLink.audioEditionId,
        confidence: audioLink.confidence,
        ebookEditionId: audioLink.ebookEditionId === loser.id ? survivor.id : audioLink.ebookEditionId,
        matchType: audioLink.matchType,
        reviewStatus: audioLink.reviewStatus,
      };
      const duplicate = await tx.audioLink.findFirst({
        where: {
          audioEditionId: nextData.audioEditionId,
          ebookEditionId: nextData.ebookEditionId,
        },
      });

      if (duplicate && duplicate.id !== audioLink.id) {
        await tx.audioLink.delete({ where: { id: audioLink.id } });
        continue;
      }

      await tx.audioLink.update({
        where: { id: audioLink.id },
        data: nextData,
      });
    }

    await tx.duplicateCandidate.update({
      where: { id: candidate.id },
      data: { status: ReviewStatus.MERGED },
    });

    const relatedCandidates = await tx.duplicateCandidate.findMany({
      where: {
        OR: [
          { leftEditionId: loser.id },
          { rightEditionId: loser.id },
        ],
      },
      include: {
        leftEdition: {
          include: {
            contributors: {
              include: {
                contributor: true,
              },
            },
            editionFiles: {
              include: {
                fileAsset: true,
              },
            },
            work: true,
          },
        },
        leftFileAsset: true,
        rightEdition: {
          include: {
            contributors: {
              include: {
                contributor: true,
              },
            },
            editionFiles: {
              include: {
                fileAsset: true,
              },
            },
            work: true,
          },
        },
        rightFileAsset: true,
      },
    });

    for (const relatedCandidate of relatedCandidates) {
      if (relatedCandidate.id === candidate.id) {
        continue;
      }

      const collapsedLeftEditionId =
        relatedCandidate.leftEditionId === loser.id ? survivor.id : relatedCandidate.leftEditionId;
      const collapsedRightEditionId =
        relatedCandidate.rightEditionId === loser.id ? survivor.id : relatedCandidate.rightEditionId;
      const nextStatus =
        collapsedLeftEditionId !== null &&
        collapsedRightEditionId !== null &&
        collapsedLeftEditionId === collapsedRightEditionId
          ? ReviewStatus.MERGED
          : ReviewStatus.IGNORED;

      await tx.duplicateCandidate.update({
        where: { id: relatedCandidate.id },
        data: {
          status: nextStatus,
        },
      });
    }

    await tx.edition.delete({
      where: { id: loser.id },
    });

    const orphanedWork = await tx.work.findUnique({
      where: { id: loser.work.id },
      include: {
        editions: true,
      },
    });

    if (orphanedWork && "editions" in orphanedWork && Array.isArray(orphanedWork.editions) && orphanedWork.editions.length === 0) {
      await tx.work.delete({
        where: { id: loser.work.id },
      });
    }

    const refreshed = await tx.duplicateCandidate.findUnique({
      where: { id: candidate.id },
      include: {
        leftEdition: {
          include: {
            contributors: {
              include: {
                contributor: true,
              },
            },
            editionFiles: {
              include: {
                fileAsset: true,
              },
            },
            work: true,
          },
        },
        leftFileAsset: true,
        rightEdition: {
          include: {
            contributors: {
              include: {
                contributor: true,
              },
            },
            editionFiles: {
              include: {
                fileAsset: true,
              },
            },
            work: true,
          },
        },
        rightFileAsset: true,
      },
    });

    if (refreshed === null) {
      throw new Error("Merged candidate was not found after update");
    }

    return toDuplicateCandidateSummary(refreshed);
  });
}

export async function getUserProgressTrackingMode(
  db: LibraryServiceDb,
  userId: string,
): Promise<ProgressTrackingMode> {
  const preference = await db.userPreference.findUnique({
    where: { userId },
  });

  return preference?.progressTrackingMode ?? ProgressTrackingMode.BY_EDITION;
}

export async function updateUserProgressTrackingMode(
  db: LibraryServiceDb,
  userId: string,
  progressTrackingMode: ProgressTrackingMode,
): Promise<ProgressTrackingMode> {
  const preference = await db.userPreference.upsert({
    where: { userId },
    create: { progressTrackingMode, userId },
    update: { progressTrackingMode },
  });

  return preference.progressTrackingMode;
}

export async function updateWorkProgressTrackingMode(
  db: LibraryServiceDb,
  userId: string,
  workId: string,
  progressTrackingMode: ProgressTrackingMode | null,
): Promise<ProgressTrackingMode | null> {
  if (progressTrackingMode === null) {
    await db.workProgressPreference.deleteMany({
      where: { userId, workId },
    });
    return null;
  }

  const preference = await db.workProgressPreference.upsert({
    where: {
      userId_workId: {
        userId,
        workId,
      },
    },
    create: { progressTrackingMode, userId, workId },
    update: { progressTrackingMode },
  });

  return preference.progressTrackingMode;
}

export async function getWorkProgressView(
  db: LibraryServiceDb,
  userId: string,
  workId: string,
): Promise<WorkProgressView | null> {
  const work = await db.work.findUnique({
    where: { id: workId },
  });

  if (work === null) {
    return null;
  }

  const [globalMode, override, progressRows] = await Promise.all([
    getUserProgressTrackingMode(db, userId),
    db.workProgressPreference.findUnique({
      where: {
        userId_workId: {
          userId,
          workId,
        },
      },
    }),
    db.readingProgress.findMany({
      where: {
        userId,
        edition: {
          workId,
        },
      },
      include: {
        edition: {
          include: {
            work: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
  ]);
  const effectiveMode = override?.progressTrackingMode ?? globalMode;
  const summaryRow = progressRows[0] ?? null;

  return {
    currentSourceEditionId: summaryRow?.editionId,
    effectiveMode,
    globalMode,
    overrideMode: override?.progressTrackingMode ?? null,
    progressRows: progressRows.map((row) => ({
      editionId: row.editionId,
      formatFamily: row.edition.formatFamily,
      id: row.id,
      locator: (row.locator ?? {}) as Record<string, object>,
      percent: row.percent,
      progressKind: row.progressKind,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
    })),
    summary: summaryRow === null
      ? null
      : {
        percent: summaryRow.percent,
        progressKind: summaryRow.progressKind,
        source: summaryRow.source,
        updatedAt: summaryRow.updatedAt.toISOString(),
      },
    workId: work.id,
    workTitle: work.titleDisplay,
  };
}
