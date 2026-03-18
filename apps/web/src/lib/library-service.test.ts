import { describe, expect, it } from "vitest";
import {
  DuplicateReason,
  FormatFamily,
  ProgressTrackingMode,
  ReviewStatus,
} from "@bookhouse/domain";
import {
  getDuplicateCandidateDetail,
  getUserProgressTrackingMode,
  getWorkProgressView,
  listDuplicateCandidates,
  mergeDuplicateCandidate,
  toDuplicateCandidateDetail,
  updateDuplicateCandidateStatus,
  updateUserProgressTrackingMode,
  updateWorkProgressTrackingMode,
  type LibraryServiceDb,
} from "./library-service";

type TestState = {
  audioLinks: Map<string, { audioEditionId: string; confidence: number | null; ebookEditionId: string; id: string; matchType: string; reviewStatus: ReviewStatus }>;
  collectionItems: Map<string, { collectionId: string; editionId: string; id: string }>;
  contributors: Map<string, { id: string; nameDisplay: string }>;
  duplicateCandidates: Map<string, {
    confidence: number | null;
    id: string;
    leftEditionId: string | null;
    leftFileAssetId: string | null;
    reason: DuplicateReason;
    rightEditionId: string | null;
    rightFileAssetId: string | null;
    status: ReviewStatus;
  }>;
  editionContributors: Map<string, { contributorId: string; editionId: string; id: string; role: "AUTHOR" }>;
  editionFiles: Map<string, { editionId: string; fileAssetId: string; id: string; role: string }>;
  editions: Map<string, {
    asin: string | null;
    createdAt: Date;
    formatFamily: FormatFamily;
    id: string;
    isbn10: string | null;
    isbn13: string | null;
    publishedAt: Date | null;
    publisher: string | null;
    updatedAt: Date;
    workId: string;
  }>;
  externalLinks: Map<string, { editionId: string; externalId: string; id: string; metadata: unknown; provider: string }>;
  fileAssets: Map<string, { absolutePath: string; createdAt: Date; fullHash: string | null; id: string; relativePath: string; updatedAt: Date }>;
  readingProgress: Map<string, {
    editionId: string;
    id: string;
    locator: Record<string, object>;
    percent: number | null;
    progressKind: "EBOOK" | "AUDIO";
    source: string | null;
    updatedAt: Date;
    userId: string;
  }>;
  userPreferences: Map<string, { progressTrackingMode: ProgressTrackingMode; userId: string }>;
  workProgressPreferences: Map<string, { progressTrackingMode: ProgressTrackingMode; userId: string; workId: string }>;
  works: Map<string, { id: string; titleDisplay: string }>;
};

function contributorKey(editionId: string, contributorId: string): string {
  return `${editionId}:${contributorId}`;
}

function createState(): TestState {
  return {
    audioLinks: new Map(),
    collectionItems: new Map(),
    contributors: new Map(),
    duplicateCandidates: new Map(),
    editionContributors: new Map(),
    editionFiles: new Map(),
    editions: new Map(),
    externalLinks: new Map(),
    fileAssets: new Map(),
    readingProgress: new Map(),
    userPreferences: new Map(),
    workProgressPreferences: new Map(),
    works: new Map(),
  };
}

function addWork(state: TestState, id: string, titleDisplay: string): void {
  state.works.set(id, { id, titleDisplay });
}

function addFileAsset(state: TestState, id: string, relativePath: string, fullHash: string | null): void {
  state.fileAssets.set(id, {
    absolutePath: `/library/${relativePath}`,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    fullHash,
    id,
    relativePath,
    updatedAt: new Date("2025-01-02T00:00:00.000Z"),
  });
}

function addEdition(state: TestState, id: string, workId: string, overrides: Partial<TestState["editions"] extends Map<string, infer TValue> ? TValue : never> = {}): void {
  state.editions.set(id, {
    asin: null,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    formatFamily: FormatFamily.EBOOK,
    id,
    isbn10: null,
    isbn13: null,
    publishedAt: null,
    publisher: null,
    updatedAt: new Date("2025-01-02T00:00:00.000Z"),
    workId,
    ...overrides,
  });
}

function addContributor(state: TestState, id: string, nameDisplay: string): void {
  state.contributors.set(id, { id, nameDisplay });
}

function addEditionContributor(state: TestState, id: string, editionId: string, contributorId: string): void {
  state.editionContributors.set(contributorKey(editionId, contributorId), {
    contributorId,
    editionId,
    id,
    role: "AUTHOR",
  });
}

function addEditionFile(state: TestState, id: string, editionId: string, fileAssetId: string): void {
  state.editionFiles.set(id, { editionId, fileAssetId, id, role: "PRIMARY" });
}

function createDb(state: TestState): LibraryServiceDb {
  const buildEdition = (editionId: string) => {
    const edition = state.editions.get(editionId);

    if (!edition) {
      return null;
    }

    return {
      ...edition,
      contributors: [...state.editionContributors.values()]
        .filter((row) => row.editionId === editionId)
        .map((row) => ({
          ...row,
          contributor: state.contributors.get(row.contributorId)!,
        })),
      editionFiles: [...state.editionFiles.values()]
        .filter((row) => row.editionId === editionId)
        .map((row) => ({
          ...row,
          fileAsset: state.fileAssets.get(row.fileAssetId)!,
        })),
      work: state.works.get(edition.workId)!,
    };
  };

  const buildCandidate = (candidateId: string) => {
    const candidate = state.duplicateCandidates.get(candidateId);

    if (!candidate) {
      return null;
    }

    return {
      ...candidate,
      leftEdition: candidate.leftEditionId ? buildEdition(candidate.leftEditionId) : null,
      leftFileAsset: candidate.leftFileAssetId ? state.fileAssets.get(candidate.leftFileAssetId) ?? null : null,
      rightEdition: candidate.rightEditionId ? buildEdition(candidate.rightEditionId) : null,
      rightFileAsset: candidate.rightFileAssetId ? state.fileAssets.get(candidate.rightFileAssetId) ?? null : null,
    };
  };

  const db: LibraryServiceDb = {
    audioLink: {
      async create() {
        throw new Error("unused");
      },
      async delete({ where }) {
        state.audioLinks.delete(where.id);
        return {};
      },
      async findFirst(args) {
        const where = args.where as { audioEditionId?: string; ebookEditionId?: string };
        return [...state.audioLinks.values()].find((row) =>
          (where.audioEditionId === undefined || row.audioEditionId === where.audioEditionId) &&
          (where.ebookEditionId === undefined || row.ebookEditionId === where.ebookEditionId),
        ) ?? null;
      },
      async findMany(args) {
        const where = args.where as { OR?: Array<{ audioEditionId?: string; ebookEditionId?: string }> };
        if (!where?.OR) {
          return [...state.audioLinks.values()];
        }
        return [...state.audioLinks.values()].filter((row) =>
          where.OR!.some((clause) =>
            (clause.audioEditionId === undefined || row.audioEditionId === clause.audioEditionId) &&
            (clause.ebookEditionId === undefined || row.ebookEditionId === clause.ebookEditionId),
          ),
        );
      },
      async update({ data, where }) {
        const row = state.audioLinks.get(where.id)!;
        state.audioLinks.set(where.id, { ...row, ...data } as typeof row);
        return {};
      },
    },
    collectionItem: {
      async create() {
        throw new Error("unused");
      },
      async delete({ where }) {
        state.collectionItems.delete(where.id);
        return {};
      },
      async findFirst(args) {
        const where = args.where as { collectionId?: string; editionId?: string };
        return [...state.collectionItems.values()].find((row) =>
          (where.collectionId === undefined || row.collectionId === where.collectionId) &&
          (where.editionId === undefined || row.editionId === where.editionId),
        ) ?? null;
      },
      async findMany(args) {
        const where = args.where as { editionId?: string };
        return [...state.collectionItems.values()].filter((row) =>
          where.editionId === undefined || row.editionId === where.editionId,
        );
      },
      async update({ data, where }) {
        const row = state.collectionItems.get(where.id)!;
        state.collectionItems.set(where.id, { ...row, ...data } as typeof row);
        return {};
      },
    },
    duplicateCandidate: {
      async findMany(args) {
        const where = args.where as { reason?: DuplicateReason; status?: ReviewStatus; OR?: Array<Record<string, string>> } | undefined;
        const candidates = [...state.duplicateCandidates.values()].filter((candidate) => {
          if (where?.reason && candidate.reason !== where.reason) {
            return false;
          }
          if (where?.status && candidate.status !== where.status) {
            return false;
          }
          if (where?.OR) {
            return where.OR.some((clause) =>
              Object.entries(clause).every(([key, value]) => (candidate as Record<string, unknown>)[key] === value),
            );
          }
          return true;
        });
        return candidates.map((candidate) => buildCandidate(candidate.id)!);
      },
      async findUnique(args) {
        const where = args.where as { id: string };
        return buildCandidate(where.id);
      },
      async update(args) {
        const where = args.where as { id: string };
        const data = args.data as Record<string, unknown>;
        const existing = state.duplicateCandidates.get(where.id)!;
        state.duplicateCandidates.set(where.id, { ...existing, ...data } as typeof existing);
        return buildCandidate(where.id)!;
      },
    },
    edition: {
      async delete({ where }) {
        state.editions.delete(where.id);
        return {};
      },
      async findUnique(args) {
        const where = args.where as { id: string };
        return buildEdition(where.id);
      },
      async update({ data, where }) {
        const existing = state.editions.get(where.id)!;
        state.editions.set(where.id, { ...existing, ...data } as typeof existing);
        return buildEdition(where.id)!;
      },
    },
    editionContributor: {
      async create() {
        throw new Error("unused");
      },
      async delete({ where }) {
        for (const [key, value] of state.editionContributors.entries()) {
          if (value.id === where.id) {
            state.editionContributors.delete(key);
          }
        }
        return {};
      },
      async findFirst(args) {
        const where = args.where as { contributorId?: string; editionId?: string; role?: "AUTHOR" };
        return [...state.editionContributors.values()].find((row) =>
          (where.contributorId === undefined || row.contributorId === where.contributorId) &&
          (where.editionId === undefined || row.editionId === where.editionId) &&
          (where.role === undefined || row.role === where.role),
        ) ?? null;
      },
      async findMany(args) {
        const where = args.where as { editionId?: string };
        return [...state.editionContributors.values()].filter((row) =>
          where.editionId === undefined || row.editionId === where.editionId,
        );
      },
      async update({ data, where }) {
        for (const [key, value] of state.editionContributors.entries()) {
          if (value.id === where.id) {
            const updated = { ...value, ...data } as typeof value;
            state.editionContributors.delete(key);
            state.editionContributors.set(contributorKey(updated.editionId, updated.contributorId), updated);
            return {};
          }
        }
        throw new Error(`Unknown edition contributor ${where.id}`);
      },
    },
    editionFile: {
      async create() {
        throw new Error("unused");
      },
      async delete({ where }) {
        state.editionFiles.delete(where.id);
        return {};
      },
      async findFirst(args) {
        const where = args.where as { editionId?: string; fileAssetId?: string };
        return [...state.editionFiles.values()].find((row) =>
          (where.editionId === undefined || row.editionId === where.editionId) &&
          (where.fileAssetId === undefined || row.fileAssetId === where.fileAssetId),
        ) ?? null;
      },
      async findMany(args) {
        const where = args.where as { editionId?: string };
        return [...state.editionFiles.values()].filter((row) =>
          where.editionId === undefined || row.editionId === where.editionId,
        );
      },
      async update({ data, where }) {
        const existing = state.editionFiles.get(where.id)!;
        state.editionFiles.set(where.id, { ...existing, ...data } as typeof existing);
        return {};
      },
    },
    externalLink: {
      async create() {
        throw new Error("unused");
      },
      async delete({ where }) {
        state.externalLinks.delete(where.id);
        return {};
      },
      async findFirst(args) {
        const where = args.where as { editionId?: string; externalId?: string; provider?: string };
        return [...state.externalLinks.values()].find((row) =>
          (where.editionId === undefined || row.editionId === where.editionId) &&
          (where.externalId === undefined || row.externalId === where.externalId) &&
          (where.provider === undefined || row.provider === where.provider),
        ) ?? null;
      },
      async findMany(args) {
        const where = args.where as { editionId?: string };
        return [...state.externalLinks.values()].filter((row) =>
          where.editionId === undefined || row.editionId === where.editionId,
        );
      },
      async update({ data, where }) {
        const existing = state.externalLinks.get(where.id)!;
        state.externalLinks.set(where.id, { ...existing, ...data } as typeof existing);
        return {};
      },
    },
    readingProgress: {
      async create() {
        throw new Error("unused");
      },
      async delete({ where }) {
        state.readingProgress.delete(where.id);
        return {};
      },
      async findMany(args) {
        const where = args.where as {
          edition?: { workId?: string };
          editionId?: string | { in?: string[] };
          userId?: string;
        };
        return [...state.readingProgress.values()]
          .filter((row) => {
            if (where.userId && row.userId !== where.userId) {
              return false;
            }
            if (typeof where.editionId === "string" && row.editionId !== where.editionId) {
              return false;
            }
            if (typeof where.editionId === "object" && where.editionId?.in && !where.editionId.in.includes(row.editionId)) {
              return false;
            }
            if (where.edition?.workId) {
              const edition = state.editions.get(row.editionId)!;
              return edition.workId === where.edition.workId;
            }
            return true;
          })
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
          .map((row) => ({
            ...row,
            edition: {
              formatFamily: state.editions.get(row.editionId)!.formatFamily,
              id: row.editionId,
              work: state.works.get(state.editions.get(row.editionId)!.workId)!,
            },
          }));
      },
      async update({ data, where }) {
        const existing = state.readingProgress.get(where.id)!;
        state.readingProgress.set(where.id, { ...existing, ...data } as typeof existing);
        return {};
      },
    },
    userPreference: {
      async findUnique(args) {
        const where = args.where as { userId: string };
        return state.userPreferences.get(where.userId) ?? null;
      },
      async upsert(args) {
        const where = args.where as { userId: string };
        const create = args.create as { progressTrackingMode: ProgressTrackingMode; userId: string };
        const update = args.update as { progressTrackingMode: ProgressTrackingMode };
        const existing = state.userPreferences.get(where.userId);
        const next = existing
          ? { ...existing, ...update }
          : create;
        state.userPreferences.set(where.userId, next);
        return next;
      },
    },
    work: {
      async delete({ where }) {
        state.works.delete(where.id);
        return {};
      },
      async findUnique(args) {
        const where = args.where as { id: string };
        const work = state.works.get(where.id);
        if (!work) {
          return null;
        }
        return {
          ...work,
          editions: [...state.editions.values()].filter((edition) => edition.workId === work.id),
        };
      },
    },
    workProgressPreference: {
      async deleteMany(args) {
        const where = args.where as { userId: string; workId: string };
        const key = `${where.userId}:${where.workId}`;
        const existed = state.workProgressPreferences.delete(key);
        return { count: existed ? 1 : 0 };
      },
      async findUnique(args) {
        const where = args.where as { userId_workId: { userId: string; workId: string } };
        return state.workProgressPreferences.get(`${where.userId_workId.userId}:${where.userId_workId.workId}`) ?? null;
      },
      async upsert(args) {
        const where = args.where as { userId_workId: { userId: string; workId: string } };
        const create = args.create as { progressTrackingMode: ProgressTrackingMode; userId: string; workId: string };
        const update = args.update as { progressTrackingMode: ProgressTrackingMode };
        const key = `${where.userId_workId.userId}:${where.userId_workId.workId}`;
        const existing = state.workProgressPreferences.get(key);
        const next = existing ? { ...existing, ...update } : create;
        state.workProgressPreferences.set(key, next);
        return next;
      },
    },
  };

  (db as LibraryServiceDb & { $transaction: (callback: (tx: LibraryServiceDb) => Promise<unknown>) => Promise<unknown> }).$transaction =
    async (callback) => callback(db);

  return db;
}

describe("library service", () => {
  it("lists, loads, and updates duplicate candidates", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addContributor(state, "contributor-1", "N. K. Jemisin");
    addFileAsset(state, "file-1", "one/book.epub", "hash-1");
    addFileAsset(state, "file-2", "two/book.epub", "hash-2");
    addEdition(state, "edition-1", "work-1", { isbn13: "9780316498834" });
    addEdition(state, "edition-2", "work-1", { isbn13: "9780316498834" });
    addEditionContributor(state, "edition-contributor-1", "edition-1", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-2", "contributor-1");
    addEditionFile(state, "edition-file-1", "edition-1", "file-1");
    addEditionFile(state, "edition-file-2", "edition-2", "file-2");
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

    const db = createDb(state);
    const list = await listDuplicateCandidates(db, { status: ReviewStatus.PENDING });
    const detail = await getDuplicateCandidateDetail(db, "candidate-1");
    const updated = await updateDuplicateCandidateStatus(db, "candidate-1", ReviewStatus.CONFIRMED);

    expect(list).toHaveLength(1);
    expect(detail).toMatchObject({
      leftAuthors: ["N. K. Jemisin"],
      leftIsbns: ["9780316498834"],
      mergeable: true,
      rightPaths: ["two/book.epub"],
    });
    expect(updated.status).toBe(ReviewStatus.CONFIRMED);
    expect(toDuplicateCandidateDetail((await db.duplicateCandidate.findUnique({ where: { id: "candidate-1" } }))!)).toMatchObject({
      mergeable: true,
    });
  });

  it("formats file-only candidates and missing sides correctly", async () => {
    const state = createState();
    addFileAsset(state, "file-1", "lonely/book.epub", "hash-1");
    state.duplicateCandidates.set("candidate-1", {
      confidence: null,
      id: "candidate-1",
      leftEditionId: null,
      leftFileAssetId: "file-1",
      reason: DuplicateReason.SAME_HASH,
      rightEditionId: null,
      rightFileAssetId: null,
      status: ReviewStatus.PENDING,
    });

    const detail = await getDuplicateCandidateDetail(createDb(state), "candidate-1");

    expect(detail).toMatchObject({
      leftHashes: ["hash-1"],
      leftLabel: "book.epub",
      mergeable: false,
      rightLabel: "Missing",
      rightPaths: [],
    });
  });

  it("formats details when the left side is missing and ALL filters are used", async () => {
    const state = createState();
    addFileAsset(state, "file-2", "paired/book.epub", "hash-2");
    state.duplicateCandidates.set("candidate-2", {
      confidence: null,
      id: "candidate-2",
      leftEditionId: null,
      leftFileAssetId: null,
      reason: DuplicateReason.SAME_HASH,
      rightEditionId: null,
      rightFileAssetId: "file-2",
      status: ReviewStatus.IGNORED,
    });

    const db = createDb(state);
    const detail = await getDuplicateCandidateDetail(db, "candidate-2");
    const list = await listDuplicateCandidates(db, { reason: "ALL", status: "ALL" });

    expect(detail).toMatchObject({
      leftFileCount: 0,
      leftLabel: "Missing",
      rightFileCount: 1,
      rightLabel: "book.epub",
    });
    expect(list).toEqual([
      expect.objectContaining({
        id: "candidate-2",
        status: ReviewStatus.IGNORED,
      }),
    ]);
  });

  it("filters duplicate candidates by reason", async () => {
    const state = createState();
    state.duplicateCandidates.set("candidate-1", {
      confidence: 1,
      id: "candidate-1",
      leftEditionId: null,
      leftFileAssetId: null,
      reason: DuplicateReason.SAME_HASH,
      rightEditionId: null,
      rightFileAssetId: null,
      status: ReviewStatus.PENDING,
    });
    state.duplicateCandidates.set("candidate-2", {
      confidence: 1,
      id: "candidate-2",
      leftEditionId: null,
      leftFileAssetId: null,
      reason: DuplicateReason.SAME_ISBN,
      rightEditionId: null,
      rightFileAssetId: null,
      status: ReviewStatus.PENDING,
    });

    const list = await listDuplicateCandidates(createDb(state), { reason: DuplicateReason.SAME_HASH });

    expect(list).toEqual([
      expect.objectContaining({
        id: "candidate-1",
        reason: DuplicateReason.SAME_HASH,
      }),
    ]);
  });

  it("returns null when a duplicate candidate detail is missing", async () => {
    const detail = await getDuplicateCandidateDetail(createDb(createState()), "missing-candidate");

    expect(detail).toBeNull();
  });

  it("merges duplicate editions, dedupes relations, and removes an orphaned losing work", async () => {
    const state = createState();
    addWork(state, "work-1", "Keep Work");
    addWork(state, "work-2", "Lose Work");
    addContributor(state, "contributor-1", "N. K. Jemisin");
    addFileAsset(state, "file-1", "one/book.epub", "hash-1");
    addFileAsset(state, "file-2", "two/book.epub", "hash-2");
    addEdition(state, "edition-1", "work-1", { isbn13: "9780316498834" });
    addEdition(state, "edition-2", "work-2", { publisher: "Orbit" });
    addEditionContributor(state, "edition-contributor-1", "edition-1", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-2", "contributor-1");
    addEditionFile(state, "edition-file-1", "edition-1", "file-1");
    addEditionFile(state, "edition-file-2", "edition-2", "file-2");
    state.collectionItems.set("collection-item-1", { collectionId: "collection-1", editionId: "edition-2", id: "collection-item-1" });
    state.collectionItems.set("collection-item-2", { collectionId: "collection-1", editionId: "edition-1", id: "collection-item-2" });
    state.externalLinks.set("external-link-1", { editionId: "edition-2", externalId: "abc", id: "external-link-1", metadata: null, provider: "openlibrary" });
    state.readingProgress.set("progress-1", {
      editionId: "edition-2",
      id: "progress-1",
      locator: { chapter: {} },
      percent: 0.5,
      progressKind: "EBOOK",
      source: "kindle",
      updatedAt: new Date("2025-01-03T00:00:00.000Z"),
      userId: "user-1",
    });
    state.readingProgress.set("progress-2", {
      editionId: "edition-1",
      id: "progress-2",
      locator: { chapter: {} },
      percent: 0.2,
      progressKind: "EBOOK",
      source: "kindle",
      updatedAt: new Date("2025-01-01T00:00:00.000Z"),
      userId: "user-1",
    });
    state.audioLinks.set("audio-link-1", {
      audioEditionId: "audio-1",
      confidence: 0.8,
      ebookEditionId: "edition-2",
      id: "audio-link-1",
      matchType: "manual",
      reviewStatus: ReviewStatus.PENDING,
    });
    state.duplicateCandidates.set("candidate-1", {
      confidence: 0.9,
      id: "candidate-1",
      leftEditionId: "edition-1",
      leftFileAssetId: null,
      reason: DuplicateReason.SIMILAR_TITLE_AUTHOR,
      rightEditionId: "edition-2",
      rightFileAssetId: null,
      status: ReviewStatus.CONFIRMED,
    });
    state.duplicateCandidates.set("candidate-2", {
      confidence: 1,
      id: "candidate-2",
      leftEditionId: "edition-2",
      leftFileAssetId: null,
      reason: DuplicateReason.SAME_ISBN,
      rightEditionId: "edition-3",
      rightFileAssetId: null,
      status: ReviewStatus.PENDING,
    });
    state.duplicateCandidates.set("candidate-3", {
      confidence: 1,
      id: "candidate-3",
      leftEditionId: "edition-2",
      leftFileAssetId: null,
      reason: DuplicateReason.SAME_ISBN,
      rightEditionId: "edition-1",
      rightFileAssetId: null,
      status: ReviewStatus.PENDING,
    });
    state.duplicateCandidates.set("candidate-4", {
      confidence: 1,
      id: "candidate-4",
      leftEditionId: null,
      leftFileAssetId: null,
      reason: DuplicateReason.SAME_HASH,
      rightEditionId: "edition-2",
      rightFileAssetId: null,
      status: ReviewStatus.PENDING,
    });
    addEdition(state, "edition-3", "work-1");

    const merged = await mergeDuplicateCandidate(createDb(state), "candidate-1", "left");

    expect(merged.status).toBe(ReviewStatus.MERGED);
    expect(state.editions.has("edition-2")).toBe(false);
    expect(state.works.has("work-2")).toBe(false);
    expect([...state.editionFiles.values()].some((row) => row.editionId === "edition-1" && row.fileAssetId === "file-2")).toBe(true);
    expect(state.editions.get("edition-1")?.publisher).toBe("Orbit");
    expect(state.readingProgress.has("progress-2")).toBe(false);
    expect(state.audioLinks.get("audio-link-1")?.ebookEditionId).toBe("edition-1");
    expect(state.duplicateCandidates.get("candidate-2")?.status).toBe(ReviewStatus.IGNORED);
    expect(state.duplicateCandidates.get("candidate-3")?.status).toBe(ReviewStatus.MERGED);
    expect(state.duplicateCandidates.get("candidate-4")?.status).toBe(ReviewStatus.IGNORED);
  });

  it("covers merge update and delete branches for moved relations", async () => {
    const state = createState();
    addWork(state, "work-1", "Keep Work");
    addContributor(state, "contributor-1", "Primary Author");
    addContributor(state, "contributor-2", "Second Author");
    addFileAsset(state, "file-1", "shared.epub", "hash-1");
    addFileAsset(state, "file-2", "unique.epub", "hash-2");
    addEdition(state, "edition-1", "work-1");
    addEdition(state, "edition-2", "work-1");
    addEditionContributor(state, "edition-contributor-1", "edition-1", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-2", "contributor-1");
    addEditionContributor(state, "edition-contributor-3", "edition-2", "contributor-2");
    addEditionFile(state, "edition-file-1", "edition-1", "file-1");
    addEditionFile(state, "edition-file-2", "edition-2", "file-1");
    addEditionFile(state, "edition-file-3", "edition-2", "file-2");
    state.collectionItems.set("collection-item-1", { collectionId: "collection-1", editionId: "edition-1", id: "collection-item-1" });
    state.collectionItems.set("collection-item-2", { collectionId: "collection-2", editionId: "edition-2", id: "collection-item-2" });
    state.externalLinks.set("external-link-1", { editionId: "edition-1", externalId: "dup", id: "external-link-1", metadata: null, provider: "openlibrary" });
    state.externalLinks.set("external-link-2", { editionId: "edition-2", externalId: "dup", id: "external-link-2", metadata: null, provider: "openlibrary" });
    state.externalLinks.set("external-link-3", { editionId: "edition-2", externalId: "unique", id: "external-link-3", metadata: null, provider: "goodreads" });
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

    await mergeDuplicateCandidate(createDb(state), "candidate-1", "left");

    expect([...state.editionFiles.values()].some((row) => row.id === "edition-file-2")).toBe(false);
    expect([...state.editionFiles.values()].some((row) => row.id === "edition-file-3" && row.editionId === "edition-1")).toBe(true);
    expect([...state.editionContributors.values()].some((row) => row.id === "edition-contributor-3" && row.editionId === "edition-1")).toBe(true);
    expect(state.collectionItems.get("collection-item-2")?.editionId).toBe("edition-1");
    expect(state.externalLinks.has("external-link-2")).toBe(false);
    expect(state.externalLinks.get("external-link-3")?.editionId).toBe("edition-1");
  });

  it("drops duplicate audio links during merge and throws if the merged candidate disappears", async () => {
    const state = createState();
    addWork(state, "work-1", "Keep Work");
    addContributor(state, "contributor-1", "Author");
    addFileAsset(state, "file-1", "one.epub", "hash-1");
    addFileAsset(state, "file-2", "two.epub", "hash-2");
    addEdition(state, "edition-1", "work-1");
    addEdition(state, "edition-2", "work-1");
    addEditionContributor(state, "edition-contributor-1", "edition-1", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-2", "contributor-1");
    addEditionFile(state, "edition-file-1", "edition-1", "file-1");
    addEditionFile(state, "edition-file-2", "edition-2", "file-2");
    state.audioLinks.set("audio-link-1", {
      audioEditionId: "audio-1",
      confidence: 0.8,
      ebookEditionId: "edition-2",
      id: "audio-link-1",
      matchType: "manual",
      reviewStatus: ReviewStatus.PENDING,
    });
    state.audioLinks.set("audio-link-2", {
      audioEditionId: "audio-1",
      confidence: 0.8,
      ebookEditionId: "edition-1",
      id: "audio-link-2",
      matchType: "manual",
      reviewStatus: ReviewStatus.PENDING,
    });
    state.duplicateCandidates.set("candidate-1", {
      confidence: 0.9,
      id: "candidate-1",
      leftEditionId: "edition-1",
      leftFileAssetId: null,
      reason: DuplicateReason.SIMILAR_TITLE_AUTHOR,
      rightEditionId: "edition-2",
      rightFileAssetId: null,
      status: ReviewStatus.PENDING,
    });

    const db = createDb(state);
    await mergeDuplicateCandidate(db, "candidate-1", "left");
    expect(state.audioLinks.has("audio-link-1")).toBe(false);

    const disappearingDb = createDb(state);
    const originalFindUnique = disappearingDb.duplicateCandidate.findUnique;
    let findCount = 0;
    disappearingDb.duplicateCandidate.findUnique = async (args) => {
      findCount += 1;
      if (findCount > 1) {
        return null;
      }
      return originalFindUnique(args);
    };

    state.editions.set("edition-2", {
      asin: null,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      formatFamily: FormatFamily.EBOOK,
      id: "edition-2",
      isbn10: null,
      isbn13: null,
      publishedAt: null,
      publisher: null,
      updatedAt: new Date("2025-01-02T00:00:00.000Z"),
      workId: "work-1",
    });
    state.duplicateCandidates.set("candidate-1", {
      confidence: 0.9,
      id: "candidate-1",
      leftEditionId: "edition-1",
      leftFileAssetId: null,
      reason: DuplicateReason.SIMILAR_TITLE_AUTHOR,
      rightEditionId: "edition-2",
      rightFileAssetId: null,
      status: ReviewStatus.PENDING,
    });

    await expect(mergeDuplicateCandidate(disappearingDb, "candidate-1", "left")).rejects.toThrow(
      "Merged candidate was not found after update",
    );
  });

  it("rejects file-only merges and resolves global plus per-work progress preferences", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addEdition(state, "edition-1", "work-1", { formatFamily: FormatFamily.EBOOK });
    addEdition(state, "edition-2", "work-1", { formatFamily: FormatFamily.AUDIOBOOK });
    state.duplicateCandidates.set("candidate-1", {
      confidence: 1,
      id: "candidate-1",
      leftEditionId: null,
      leftFileAssetId: "file-1",
      reason: DuplicateReason.SAME_HASH,
      rightEditionId: null,
      rightFileAssetId: "file-2",
      status: ReviewStatus.PENDING,
    });
    state.readingProgress.set("progress-1", {
      editionId: "edition-1",
      id: "progress-1",
      locator: { cfi: {} },
      percent: 0.3,
      progressKind: "EBOOK",
      source: "kobo",
      updatedAt: new Date("2025-01-02T00:00:00.000Z"),
      userId: "user-1",
    });
    state.readingProgress.set("progress-2", {
      editionId: "edition-2",
      id: "progress-2",
      locator: null as unknown as Record<string, object>,
      percent: 0.7,
      progressKind: "AUDIO",
      source: "audible",
      updatedAt: new Date("2025-01-03T00:00:00.000Z"),
      userId: "user-1",
    });

    const db = createDb(state);

    await expect(mergeDuplicateCandidate(db, "candidate-1", "left")).rejects.toThrow(
      "Only edition-level ebook duplicate candidates can be merged",
    );

    expect(await getUserProgressTrackingMode(db, "user-1")).toBe(ProgressTrackingMode.BY_EDITION);
    expect(await updateUserProgressTrackingMode(db, "user-1", ProgressTrackingMode.BY_WORK)).toBe(
      ProgressTrackingMode.BY_WORK,
    );
    expect(await updateWorkProgressTrackingMode(db, "user-1", "work-1", ProgressTrackingMode.BY_EDITION)).toBe(
      ProgressTrackingMode.BY_EDITION,
    );

    const view = await getWorkProgressView(db, "user-1", "work-1");

    expect(view).toMatchObject({
      effectiveMode: ProgressTrackingMode.BY_EDITION,
      globalMode: ProgressTrackingMode.BY_WORK,
      overrideMode: ProgressTrackingMode.BY_EDITION,
      progressRows: [
        expect.objectContaining({
          locator: {},
        }),
        expect.objectContaining({
          locator: { cfi: {} },
        }),
      ],
      summary: {
        progressKind: "AUDIO",
      },
      workTitle: "The Fifth Season",
    });

    expect(await updateWorkProgressTrackingMode(db, "user-1", "work-1", null)).toBeNull();
    expect((await getWorkProgressView(db, "user-1", "missing-work"))).toBeNull();
  });

  it("uses the non-transaction fallback when the db does not provide $transaction", async () => {
    const state = createState();
    addWork(state, "work-1", "Keep Work");
    addContributor(state, "contributor-1", "Author");
    addFileAsset(state, "file-1", "one.epub", "hash-1");
    addFileAsset(state, "file-2", "two.epub", "hash-2");
    addEdition(state, "edition-1", "work-1");
    addEdition(state, "edition-2", "work-1");
    addEditionContributor(state, "edition-contributor-1", "edition-1", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-2", "contributor-1");
    addEditionFile(state, "edition-file-1", "edition-1", "file-1");
    addEditionFile(state, "edition-file-2", "edition-2", "file-2");
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

    const db = createDb(state) as LibraryServiceDb & { $transaction?: unknown };
    delete db.$transaction;

    await expect(mergeDuplicateCandidate(db, "candidate-1", "left")).resolves.toMatchObject({
      id: "candidate-1",
      status: ReviewStatus.MERGED,
    });
  });

  it("returns an empty work progress view when a work exists without progress rows", async () => {
    const state = createState();
    addWork(state, "work-9", "Empty Work");

    const view = await getWorkProgressView(createDb(state), "user-9", "work-9");

    expect(view).toMatchObject({
      currentSourceEditionId: undefined,
      effectiveMode: ProgressTrackingMode.BY_EDITION,
      globalMode: ProgressTrackingMode.BY_EDITION,
      overrideMode: null,
      progressRows: [],
      summary: null,
      workId: "work-9",
      workTitle: "Empty Work",
    });
  });

  it("supports keeping the right edition during merge", async () => {
    const state = createState();
    addWork(state, "work-1", "Shared Work");
    addContributor(state, "contributor-1", "Author");
    addFileAsset(state, "file-1", "left.epub", "hash-1");
    addFileAsset(state, "file-2", "right.epub", "hash-2");
    addEdition(state, "edition-1", "work-1", { publisher: "Left Publisher" });
    addEdition(state, "edition-2", "work-1");
    addEditionContributor(state, "edition-contributor-1", "edition-1", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-2", "contributor-1");
    addEditionFile(state, "edition-file-1", "edition-1", "file-1");
    addEditionFile(state, "edition-file-2", "edition-2", "file-2");
    state.audioLinks.set("audio-link-1", {
      audioEditionId: "edition-1",
      confidence: 0.6,
      ebookEditionId: "ebook-other",
      id: "audio-link-1",
      matchType: "manual",
      reviewStatus: ReviewStatus.PENDING,
    });
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

    const merged = await mergeDuplicateCandidate(createDb(state), "candidate-1", "right");

    expect(merged.status).toBe(ReviewStatus.MERGED);
    expect(state.editions.has("edition-1")).toBe(false);
    expect(state.editions.get("edition-2")?.publisher).toBe("Left Publisher");
    expect(state.audioLinks.get("audio-link-1")?.audioEditionId).toBe("edition-2");
  });

  it("keeps the survivor progress row in place when it is already the newest", async () => {
    const state = createState();
    addWork(state, "work-1", "Shared Work");
    addContributor(state, "contributor-1", "Author");
    addFileAsset(state, "file-1", "left.epub", "hash-1");
    addFileAsset(state, "file-2", "right.epub", "hash-2");
    addEdition(state, "edition-1", "work-1");
    addEdition(state, "edition-2", "work-1");
    addEditionContributor(state, "edition-contributor-1", "edition-1", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-2", "contributor-1");
    addEditionFile(state, "edition-file-1", "edition-1", "file-1");
    addEditionFile(state, "edition-file-2", "edition-2", "file-2");
    state.readingProgress.set("progress-1", {
      editionId: "edition-1",
      id: "progress-1",
      locator: { cfi: {} },
      percent: 0.8,
      progressKind: "EBOOK",
      source: null,
      updatedAt: new Date("2025-01-04T00:00:00.000Z"),
      userId: "user-1",
    });
    state.readingProgress.set("progress-2", {
      editionId: "edition-2",
      id: "progress-2",
      locator: { cfi: {} },
      percent: 0.3,
      progressKind: "EBOOK",
      source: null,
      updatedAt: new Date("2025-01-03T00:00:00.000Z"),
      userId: "user-1",
    });
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

    await mergeDuplicateCandidate(createDb(state), "candidate-1", "left");

    expect(state.readingProgress.get("progress-1")?.editionId).toBe("edition-1");
    expect(state.readingProgress.has("progress-2")).toBe(false);
  });
});
