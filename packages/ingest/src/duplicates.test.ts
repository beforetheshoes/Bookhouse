import { describe, expect, it } from "vitest";
import {
  AvailabilityStatus,
  ContributorRole,
  DuplicateReason,
  EditionFileRole,
  FormatFamily,
  MediaKind,
  ReviewStatus,
} from "@bookhouse/domain";
import { createIngestServices, DUPLICATE_INTERNALS, type IngestDb } from "./index";

type TestFileAsset = {
  absolutePath: string;
  availabilityStatus: AvailabilityStatus;
  fullHash: string | null;
  id: string;
  libraryRootId: string;
  mediaKind: MediaKind;
  metadata: null;
  mtime: Date | null;
  partialHash: string | null;
  relativePath: string;
  sizeBytes: bigint | null;
};

type TestWork = {
  id: string;
  sortTitle: string | null;
  titleCanonical: string;
  titleDisplay: string;
};

type TestEdition = {
  asin: string | null;
  formatFamily: FormatFamily;
  id: string;
  isbn10: string | null;
  isbn13: string | null;
  publishedAt: Date | null;
  publisher: string | null;
  workId: string;
};

type TestContributor = {
  id: string;
  nameCanonical: string;
  nameDisplay: string;
};

type TestEditionContributor = {
  contributorId: string;
  editionId: string;
  id: string;
  role: ContributorRole;
};

type TestEditionFile = {
  editionId: string;
  fileAssetId: string;
  id: string;
  role: EditionFileRole;
};

type TestDuplicateCandidate = {
  confidence: number | null;
  id: string;
  leftEditionId: string | null;
  leftFileAssetId: string | null;
  reason: DuplicateReason;
  rightEditionId: string | null;
  rightFileAssetId: string | null;
  status: ReviewStatus;
};

type DuplicateState = {
  contributors: Map<string, TestContributor>;
  duplicateCandidates: Map<string, TestDuplicateCandidate>;
  editionContributors: Map<string, TestEditionContributor>;
  editionFiles: Map<string, TestEditionFile>;
  editions: Map<string, TestEdition>;
  fileAssets: Map<string, TestFileAsset>;
  works: Map<string, TestWork>;
};

function createState(): DuplicateState {
  return {
    contributors: new Map(),
    duplicateCandidates: new Map(),
    editionContributors: new Map(),
    editionFiles: new Map(),
    editions: new Map(),
    fileAssets: new Map(),
    works: new Map(),
  };
}

function editionFileKey(editionId: string, fileAssetId: string): string {
  return `${editionId}:${fileAssetId}`;
}

function editionContributorKey(editionId: string, contributorId: string, role: ContributorRole): string {
  return `${editionId}:${contributorId}:${role}`;
}

function createDuplicateTestDb(state: DuplicateState): IngestDb {
  let duplicateSequence = state.duplicateCandidates.size;

  return {
    libraryRoot: {
      async findUnique() {
        return null;
      },
      async update() {
        throw new Error("unused");
      },
    },
    fileAsset: {
      async findMany(args: Record<string, unknown>) {
        const where = (args.where ?? {}) as {
          libraryRootId?: string;
        };

        return [...state.fileAssets.values()].filter((fileAsset) =>
          where.libraryRootId === undefined || fileAsset.libraryRootId === where.libraryRootId,
        );
      },
      async findUnique({ where }: { where: { id: string } }) {
        return state.fileAssets.get(where.id) ?? null;
      },
      async update() {
        throw new Error("unused");
      },
      async upsert() {
        throw new Error("unused");
      },
    },
    work: {
      async create() {
        throw new Error("unused");
      },
      async findMany() {
        throw new Error("unused");
      },
    },
    edition: {
      async create() {
        throw new Error("unused");
      },
      async findFirst() {
        throw new Error("unused");
      },
      async findMany(args: Record<string, unknown>) {
        const editionIds = new Set<string>(
          (((args.where ?? {}) as { id?: { in?: string[] } }).id?.in ?? []),
        );

        return [...state.editions.values()]
          .filter((edition) => editionIds.size === 0 || editionIds.has(edition.id))
          .map((edition) => ({
            ...edition,
            contributors: [...state.editionContributors.values()]
              .filter((link) => link.editionId === edition.id)
              .map((link) => ({
                ...link,
                contributor: state.contributors.get(link.contributorId)!,
              })),
            editionFiles: [...state.editionFiles.values()]
              .filter((editionFile) => editionFile.editionId === edition.id)
              .map((editionFile) => ({
                ...editionFile,
                fileAsset: state.fileAssets.get(editionFile.fileAssetId)!,
              })),
            work: state.works.get(edition.workId)!,
          }));
      },
      async findUnique() {
        throw new Error("unused");
      },
    },
    editionFile: {
      async create() {
        throw new Error("unused");
      },
      async findFirst() {
        throw new Error("unused");
      },
      async findMany(args: Record<string, unknown>) {
        const fileAssetIds = new Set<string>(
          ((((args.where ?? {}) as { fileAssetId?: { in?: string[] } }).fileAssetId)?.in ?? []),
        );

        return [...state.editionFiles.values()].filter((editionFile) =>
          fileAssetIds.size === 0 || fileAssetIds.has(editionFile.fileAssetId),
        );
      },
    },
    contributor: {
      async create() {
        throw new Error("unused");
      },
      async findMany() {
        throw new Error("unused");
      },
    },
    editionContributor: {
      async create() {
        throw new Error("unused");
      },
      async findFirst() {
        throw new Error("unused");
      },
    },
    duplicateCandidate: {
      async create({
        data,
      }: {
        data: {
          confidence?: number | null;
          leftEditionId?: string | null;
          leftFileAssetId?: string | null;
          reason: DuplicateReason;
          rightEditionId?: string | null;
          rightFileAssetId?: string | null;
          status?: ReviewStatus;
        };
      }) {
        duplicateSequence += 1;
        const candidate: TestDuplicateCandidate = {
          confidence: data.confidence ?? null,
          id: `candidate-${duplicateSequence}`,
          leftEditionId: data.leftEditionId ?? null,
          leftFileAssetId: data.leftFileAssetId ?? null,
          reason: data.reason,
          rightEditionId: data.rightEditionId ?? null,
          rightFileAssetId: data.rightFileAssetId ?? null,
          status: data.status ?? ReviewStatus.PENDING,
        };
        state.duplicateCandidates.set(candidate.id, candidate);
        return candidate;
      },
      async findMany() {
        return [...state.duplicateCandidates.values()];
      },
      async update({
        data,
        where,
      }: {
        data: Partial<TestDuplicateCandidate>;
        where: { id: string };
      }) {
        const existing = state.duplicateCandidates.get(where.id);

        if (!existing) {
          throw new Error(`Unknown duplicate candidate ${where.id}`);
        }

        const updated = {
          ...existing,
          ...data,
        };
        state.duplicateCandidates.set(updated.id, updated);
        return updated;
      },
    },
  } as unknown as IngestDb;
}

function addFileAsset(state: DuplicateState, overrides: Partial<TestFileAsset>): void {
  const fileAsset: TestFileAsset = {
    absolutePath: "/library/book.epub",
    availabilityStatus: AvailabilityStatus.PRESENT,
    fullHash: null,
    id: "file-1",
    libraryRootId: "root-1",
    mediaKind: MediaKind.EPUB,
    metadata: null,
    mtime: new Date("2025-01-01T00:00:00.000Z"),
    partialHash: null,
    relativePath: "book.epub",
    sizeBytes: 1n,
    ...overrides,
  };
  state.fileAssets.set(fileAsset.id, fileAsset);
}

function addWork(state: DuplicateState, overrides: Partial<TestWork>): void {
  const work: TestWork = {
    id: "work-1",
    sortTitle: null,
    titleCanonical: "the fifth season",
    titleDisplay: "The Fifth Season",
    ...overrides,
  };
  state.works.set(work.id, work);
}

function addEdition(state: DuplicateState, overrides: Partial<TestEdition>): void {
  const edition: TestEdition = {
    asin: null,
    formatFamily: FormatFamily.EBOOK,
    id: "edition-1",
    isbn10: null,
    isbn13: null,
    publishedAt: null,
    publisher: null,
    workId: "work-1",
    ...overrides,
  };
  state.editions.set(edition.id, edition);
}

function addContributor(state: DuplicateState, overrides: Partial<TestContributor>): void {
  const contributor: TestContributor = {
    id: "contributor-1",
    nameCanonical: "n k jemisin",
    nameDisplay: "N. K. Jemisin",
    ...overrides,
  };
  state.contributors.set(contributor.id, contributor);
}

function addEditionContributor(state: DuplicateState, overrides: Partial<TestEditionContributor>): void {
  const editionContributor: TestEditionContributor = {
    contributorId: "contributor-1",
    editionId: "edition-1",
    id: "edition-contributor-1",
    role: ContributorRole.AUTHOR,
    ...overrides,
  };
  state.editionContributors.set(
    editionContributorKey(
      editionContributor.editionId,
      editionContributor.contributorId,
      editionContributor.role,
    ),
    editionContributor,
  );
}

function addEditionFile(state: DuplicateState, overrides: Partial<TestEditionFile>): void {
  const editionFile: TestEditionFile = {
    editionId: "edition-1",
    fileAssetId: "file-1",
    id: "edition-file-1",
    role: EditionFileRole.PRIMARY,
    ...overrides,
  };
  state.editionFiles.set(editionFileKey(editionFile.editionId, editionFile.fileAssetId), editionFile);
}

describe("detectDuplicates", () => {
  it("creates same-hash and same-isbn candidates idempotently for a targeted import", async () => {
    const state = createState();
    addWork(state, { id: "work-1" });
    addContributor(state, { id: "contributor-1" });
    addFileAsset(state, {
      absolutePath: "/library/one/book.epub",
      fullHash: "hash-1",
      id: "file-1",
      relativePath: "one/book.epub",
    });
    addFileAsset(state, {
      absolutePath: "/library/two/book.epub",
      fullHash: "hash-1",
      id: "file-2",
      relativePath: "two/book.epub",
    });
    addEdition(state, { id: "edition-1", isbn13: "9780316498834", workId: "work-1" });
    addEdition(state, { id: "edition-2", isbn13: "9780316498834", workId: "work-1" });
    addEditionContributor(state, { editionId: "edition-1", id: "edition-contributor-1" });
    addEditionContributor(state, { editionId: "edition-2", id: "edition-contributor-2" });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-1", id: "edition-file-1" });
    addEditionFile(state, { editionId: "edition-2", fileAssetId: "file-2", id: "edition-file-2" });

    const services = createIngestServices({
      db: createDuplicateTestDb(state),
    });

    const first = await services.detectDuplicates({ fileAssetId: "file-1" });
    const second = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(first.createdCandidateIds).toHaveLength(3);
    expect(second.createdCandidateIds).toHaveLength(0);
    expect([...state.duplicateCandidates.values()]).toHaveLength(3);
    expect([...state.duplicateCandidates.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          leftFileAssetId: "file-1",
          reason: DuplicateReason.SAME_HASH,
          rightFileAssetId: "file-2",
          status: ReviewStatus.PENDING,
        }),
        expect.objectContaining({
          leftEditionId: "edition-1",
          reason: DuplicateReason.SAME_ISBN,
          rightEditionId: "edition-2",
          status: ReviewStatus.PENDING,
        }),
        expect.objectContaining({
          leftEditionId: "edition-1",
          reason: DuplicateReason.SIMILAR_TITLE_AUTHOR,
          rightEditionId: "edition-2",
          status: ReviewStatus.PENDING,
        }),
      ]),
    );
  });

  it("marks stale pending candidates ignored while preserving reviewed ones", async () => {
    const state = createState();
    addWork(state, { id: "work-1" });
    addContributor(state, { id: "contributor-1" });
    addFileAsset(state, { fullHash: "hash-1", id: "file-1" });
    addFileAsset(state, { fullHash: "hash-2", id: "file-2" });
    addEdition(state, { id: "edition-1", isbn13: "9780316498834", workId: "work-1" });
    addEdition(state, { id: "edition-2", isbn13: "9780316498835", workId: "work-1" });
    addEditionContributor(state, { editionId: "edition-1", id: "edition-contributor-1" });
    addEditionContributor(state, { editionId: "edition-2", id: "edition-contributor-2" });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-1", id: "edition-file-1" });
    addEditionFile(state, { editionId: "edition-2", fileAssetId: "file-2", id: "edition-file-2" });
    state.duplicateCandidates.set("candidate-1", {
      confidence: 1,
      id: "candidate-1",
      leftEditionId: "edition-1",
      leftFileAssetId: null,
      reason: DuplicateReason.SAME_ISBN,
      rightEditionId: "edition-2",
      rightFileAssetId: null,
      status: ReviewStatus.PENDING,
    });
    state.duplicateCandidates.set("candidate-2", {
      confidence: 0.9,
      id: "candidate-2",
      leftEditionId: "edition-1",
      leftFileAssetId: null,
      reason: DuplicateReason.SIMILAR_TITLE_AUTHOR,
      rightEditionId: "edition-2",
      rightFileAssetId: null,
      status: ReviewStatus.CONFIRMED,
    });

    const services = createIngestServices({
      db: createDuplicateTestDb(state),
    });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.ignoredCandidateIds).toEqual(["candidate-1"]);
    expect(state.duplicateCandidates.get("candidate-1")?.status).toBe(ReviewStatus.IGNORED);
    expect(state.duplicateCandidates.get("candidate-2")?.status).toBe(ReviewStatus.CONFIRMED);
  });

  it("preserves reviewed statuses when a qualifying candidate is recomputed", async () => {
    const state = createState();
    addWork(state, { id: "work-1" });
    addContributor(state, { id: "contributor-1" });
    addFileAsset(state, {
      absolutePath: "/library/one/book.epub",
      fullHash: "hash-1",
      id: "file-1",
      relativePath: "one/book.epub",
    });
    addFileAsset(state, {
      absolutePath: "/library/two/book.epub",
      fullHash: "hash-1",
      id: "file-2",
      relativePath: "two/book.epub",
    });
    addEdition(state, { id: "edition-1", isbn13: "9780316498834", workId: "work-1" });
    addEdition(state, { id: "edition-2", isbn13: "9780316498834", workId: "work-1" });
    addEditionContributor(state, { editionId: "edition-1", id: "edition-contributor-1" });
    addEditionContributor(state, { editionId: "edition-2", id: "edition-contributor-2" });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-1", id: "edition-file-1" });
    addEditionFile(state, { editionId: "edition-2", fileAssetId: "file-2", id: "edition-file-2" });
    state.duplicateCandidates.set("candidate-1", {
      confidence: 1,
      id: "candidate-1",
      leftEditionId: "edition-1",
      leftFileAssetId: null,
      reason: DuplicateReason.SAME_ISBN,
      rightEditionId: "edition-2",
      rightFileAssetId: null,
      status: ReviewStatus.CONFIRMED,
    });

    const services = createIngestServices({
      db: createDuplicateTestDb(state),
    });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.updatedCandidateIds).toContain("candidate-1");
    expect(state.duplicateCandidates.get("candidate-1")?.status).toBe(ReviewStatus.CONFIRMED);
  });

  it("avoids fuzzy duplicates when editions conflict on isbn", async () => {
    const state = createState();
    addWork(state, { id: "work-1" });
    addContributor(state, { id: "contributor-1" });
    addFileAsset(state, { id: "file-1" });
    addFileAsset(state, { id: "file-2" });
    addEdition(state, { id: "edition-1", isbn13: "9780316498834", workId: "work-1" });
    addEdition(state, { id: "edition-2", isbn13: "9780316498841", workId: "work-1" });
    addEditionContributor(state, { editionId: "edition-1", id: "edition-contributor-1" });
    addEditionContributor(state, { editionId: "edition-2", id: "edition-contributor-2" });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-1", id: "edition-file-1" });
    addEditionFile(state, { editionId: "edition-2", fileAssetId: "file-2", id: "edition-file-2" });

    const services = createIngestServices({
      db: createDuplicateTestDb(state),
    });

    await services.detectDuplicates({ libraryRootId: "root-1" });

    expect([...state.duplicateCandidates.values()]).toEqual([]);
  });

  it("supports edition-scoped recomputation and skips unrelated file and isbn pairs", async () => {
    const state = createState();
    addWork(state, { id: "work-1", titleDisplay: "The Fifth Season" });
    addContributor(state, { id: "contributor-1", nameDisplay: "N. K. Jemisin" });
    addFileAsset(state, {
      absolutePath: "/library/one/book.epub",
      fullHash: "hash-1",
      id: "file-1",
      relativePath: "one/book.epub",
    });
    addFileAsset(state, {
      absolutePath: "/library/two/book.epub",
      fullHash: "hash-1",
      id: "file-2",
      relativePath: "two/book.epub",
    });
    addFileAsset(state, {
      absolutePath: "/library/three/book.epub",
      fullHash: "hash-2",
      id: "file-3",
      relativePath: "three/book.epub",
    });
    addEdition(state, { id: "edition-1", isbn13: "9780316498834", workId: "work-1" });
    addEdition(state, { id: "edition-2", isbn13: "9780316498834", workId: "work-1" });
    addEdition(state, { id: "edition-3", isbn13: null, workId: "work-1" });
    addEditionContributor(state, { editionId: "edition-1", id: "edition-contributor-1" });
    addEditionContributor(state, { editionId: "edition-2", id: "edition-contributor-2" });
    addEditionContributor(state, { editionId: "edition-3", id: "edition-contributor-3" });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-1", id: "edition-file-1" });
    addEditionFile(state, { editionId: "edition-2", fileAssetId: "file-2", id: "edition-file-2" });
    addEditionFile(state, { editionId: "edition-3", fileAssetId: "file-3", id: "edition-file-3" });

    const services = createIngestServices({
      db: createDuplicateTestDb(state),
    });

    const result = await services.detectDuplicates({ editionId: "edition-3", fileAssetId: "file-3" });

    expect(result.scannedEditionIds).toContain("edition-3");
    expect([...state.duplicateCandidates.values()]).toEqual([
      expect.objectContaining({
        leftEditionId: "edition-1",
        reason: DuplicateReason.SIMILAR_TITLE_AUTHOR,
        rightEditionId: "edition-3",
      }),
      expect.objectContaining({
        leftEditionId: "edition-2",
        reason: DuplicateReason.SIMILAR_TITLE_AUTHOR,
        rightEditionId: "edition-3",
      }),
    ]);
  });

  it("returns empty scoped results when a targeted file asset cannot be found", async () => {
    const state = createState();

    const result = await createIngestServices({
      db: createDuplicateTestDb(state),
    }).detectDuplicates({ fileAssetId: "missing-file" });

    expect(result).toEqual({
      createdCandidateIds: [],
      ignoredCandidateIds: [],
      scannedEditionIds: [],
      scannedFileAssetIds: [],
      updatedCandidateIds: [],
    });
  });

  it("supports edition-only recomputation without a file scope", async () => {
    const state = createState();
    addWork(state, { id: "work-1" });
    addContributor(state, { id: "contributor-1" });
    addEdition(state, { id: "edition-1", isbn13: "9780316498834", workId: "work-1" });
    addEdition(state, { id: "edition-2", isbn13: "9780316498834", workId: "work-1" });
    addEditionContributor(state, { editionId: "edition-1", id: "edition-contributor-1" });
    addEditionContributor(state, { editionId: "edition-2", id: "edition-contributor-2" });

    const result = await createIngestServices({
      db: createDuplicateTestDb(state),
    }).detectDuplicates({ editionId: "edition-2" });

    expect(result.scannedEditionIds).toEqual(["edition-2"]);
    expect(state.duplicateCandidates.size).toBe(0);
  });

  it("canonicalizes reverse-ordered duplicate pairs during detection", async () => {
    const state = createState();
    addWork(state, { id: "work-1" });
    addContributor(state, { id: "contributor-1" });
    addFileAsset(state, {
      fullHash: "hash-1",
      id: "file-z",
      relativePath: "z.epub",
    });
    addFileAsset(state, {
      fullHash: "hash-1",
      id: "file-a",
      relativePath: "a.epub",
    });
    addEdition(state, { id: "edition-z", isbn13: "9780316498834", workId: "work-1" });
    addEdition(state, { id: "edition-a", isbn13: "9780316498834", workId: "work-1" });
    addEditionContributor(state, { editionId: "edition-z", id: "edition-contributor-1" });
    addEditionContributor(state, { editionId: "edition-a", id: "edition-contributor-2" });
    addEditionFile(state, { editionId: "edition-z", fileAssetId: "file-z", id: "edition-file-1" });
    addEditionFile(state, { editionId: "edition-a", fileAssetId: "file-a", id: "edition-file-2" });

    await createIngestServices({
      db: createDuplicateTestDb(state),
    }).detectDuplicates({ libraryRootId: "root-1" });

    expect([...state.duplicateCandidates.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          leftFileAssetId: "file-a",
          rightFileAssetId: "file-z",
          reason: DuplicateReason.SAME_HASH,
        }),
        expect.objectContaining({
          leftEditionId: "edition-a",
          rightEditionId: "edition-z",
          reason: DuplicateReason.SAME_ISBN,
        }),
      ]),
    );
  });

  it("skips non-ebook and mismatched-author fuzzy duplicate candidates", async () => {
    const state = createState();
    addWork(state, { id: "work-1", titleDisplay: "Book One" });
    addWork(state, { id: "work-2", titleDisplay: "Book One" });
    addContributor(state, { id: "contributor-1", nameDisplay: "Author One", nameCanonical: "author one" });
    addContributor(state, { id: "contributor-2", nameDisplay: "Author Two", nameCanonical: "author two" });
    addFileAsset(state, { id: "file-1" });
    addFileAsset(state, { id: "file-2" });
    addEdition(state, { id: "edition-1", formatFamily: FormatFamily.AUDIOBOOK, workId: "work-1" });
    addEdition(state, { id: "edition-2", formatFamily: FormatFamily.EBOOK, workId: "work-2" });
    addEditionContributor(state, { editionId: "edition-1", contributorId: "contributor-1", id: "edition-contributor-1" });
    addEditionContributor(state, { editionId: "edition-2", contributorId: "contributor-2", id: "edition-contributor-2" });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-1", id: "edition-file-1" });
    addEditionFile(state, { editionId: "edition-2", fileAssetId: "file-2", id: "edition-file-2" });

    await createIngestServices({
      db: createDuplicateTestDb(state),
    }).detectDuplicates({ libraryRootId: "root-1" });

    expect(state.duplicateCandidates.size).toBe(0);
  });

  it("exposes duplicate internals for invalid candidate keys and fuzzy heuristics", () => {
    expect(() =>
      DUPLICATE_INTERNALS.createDuplicateCandidateKey({
        reason: DuplicateReason.SAME_HASH,
      }),
    ).toThrow("Duplicate candidate key requires a complete edition or file pair");
    expect(
      DUPLICATE_INTERNALS.createDuplicateCandidateKey({
        leftEditionId: "edition-z",
        reason: DuplicateReason.SAME_ISBN,
        rightEditionId: "edition-a",
      }),
    ).toBe("edition:SAME_ISBN:edition-z:edition-a");

    const left = {
      contributors: [
        {
          contributor: { nameCanonical: "author one" },
          role: ContributorRole.AUTHOR,
        },
      ],
      editionFiles: [
        {
          fileAsset: { fullHash: "hash-1" },
        },
      ],
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "edition-1",
      isbn10: null,
      isbn13: null,
      work: { titleCanonical: "book" },
    };
    const right = {
      contributors: [
        {
          contributor: { nameCanonical: "author two" },
          role: ContributorRole.AUTHOR,
        },
      ],
      editionFiles: [
        {
          fileAsset: { fullHash: "hash-1" },
        },
      ],
      formatFamily: FormatFamily.EBOOK,
      id: "edition-2",
      isbn10: null,
      isbn13: null,
      work: { titleCanonical: "different-book" },
    };

    expect(DUPLICATE_INTERNALS.canBeSameEditionDuplicate(left as never, right as never)).toBe(false);
    expect(
      DUPLICATE_INTERNALS.canBeSameEditionDuplicate(
        {
          ...left,
          formatFamily: FormatFamily.EBOOK,
          work: { titleCanonical: "book" },
        } as never,
        {
          ...right,
          contributors: [],
          formatFamily: FormatFamily.EBOOK,
          work: { titleCanonical: "book" },
        } as never,
      ),
    ).toBe(false);
    expect(
      DUPLICATE_INTERNALS.canBeSameEditionDuplicate(
        {
          ...left,
          formatFamily: FormatFamily.EBOOK,
          isbn10: "1234567890",
          work: { titleCanonical: "book" },
        } as never,
        {
          ...left,
          id: "edition-3",
          isbn10: "0987654321",
          work: { titleCanonical: "book" },
        } as never,
      ),
    ).toBe(false);
    expect(
      DUPLICATE_INTERNALS.canBeSameEditionDuplicate(
        {
          ...left,
          formatFamily: FormatFamily.EBOOK,
          id: "edition-4",
          isbn10: "1234567890",
          isbn13: null,
          work: { titleCanonical: "book" },
        } as never,
        {
          ...left,
          formatFamily: FormatFamily.EBOOK,
          id: "edition-5",
          isbn10: "1234567890",
          isbn13: null,
          work: { titleCanonical: "book" },
        } as never,
      ),
    ).toBe(true);
    expect(DUPLICATE_INTERNALS.buildFuzzyDuplicateConfidence(left as never, right as never)).toBe(0.99);
    expect(
      DUPLICATE_INTERNALS.buildFuzzyDuplicateConfidence(
        {
          ...left,
          formatFamily: FormatFamily.EBOOK,
          editionFiles: [{ fileAsset: { fullHash: "hash-2" } }],
          work: { titleCanonical: "book" },
        } as never,
        {
          ...left,
          editionFiles: [{ fileAsset: { fullHash: "hash-3" } }],
          work: { titleCanonical: "book" },
        } as never,
      ),
    ).toBe(0.9);
  });
});
