import { describe, expect, it } from "vitest";
import {
  AudioLinkMatchType,
  DuplicateReason,
  FormatFamily,
  ProgressTrackingMode,
  ReviewStatus,
} from "@bookhouse/domain";
import {
  addWorkToCollection,
  createCollection,
  createExternalLink,
  deleteReadingProgress,
  deleteCollection,
  deleteExternalLink,
  getCollectionDetail,
  getAudioLinkDetail,
  getDuplicateCandidateDetail,
  getReadingProgress,
  getWorkCollectionMembership,
  getUserProgressTrackingMode,
  getWorkProgressView,
  listExternalLinksForWork,
  listCollections,
  listAudioLinks,
  listDuplicateCandidates,
  mergeDuplicateCandidate,
  removeWorkFromCollection,
  renameCollection,
  toAudioLinkDetail,
  toDuplicateCandidateDetail,
  upsertReadingProgress,
  updateExternalLink,
  updateAudioLinkStatus,
  updateDuplicateCandidateStatus,
  updateUserProgressTrackingMode,
  updateWorkProgressTrackingMode,
  type LibraryServiceDb,
} from "./library-service";

type TestState = {
  audioLinks: Map<string, { audioEditionId: string; confidence: number | null; ebookEditionId: string; id: string; matchType: AudioLinkMatchType; reviewStatus: ReviewStatus }>;
  collectionItems: Map<string, { collectionId: string; id: string; workId: string }>;
  collections: Map<string, { id: string; kind: "MANUAL"; name: string; ownerUserId: string | null }>;
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
  externalLinks: Map<string, { editionId: string; externalId: string; id: string; lastSyncedAt: Date | null; metadata: Record<string, unknown> | null; provider: string }>;
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
    collections: new Map(),
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

function addCollection(
  state: TestState,
  id: string,
  name: string,
  ownerUserId = "user-1",
): void {
  state.collections.set(id, { id, kind: "MANUAL", name, ownerUserId });
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
  let readingProgressIdCounter = 1;
  let readingProgressTimestamp = Date.parse("2025-01-10T00:00:00.000Z");

  const nextReadingProgressTimestamp = () => {
    readingProgressTimestamp += 1;
    return new Date(readingProgressTimestamp);
  };

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

  const buildAudioLink = (linkId: string) => {
    const audioLink = state.audioLinks.get(linkId);

    if (!audioLink) {
      return null;
    }

    return {
      ...audioLink,
      audioEdition: buildEdition(audioLink.audioEditionId),
      ebookEdition: buildEdition(audioLink.ebookEditionId),
    };
  };

  const buildCollection = (collectionId: string) => {
    const collection = state.collections.get(collectionId);

    if (!collection) {
      return null;
    }

    return {
      ...collection,
      items: [...state.collectionItems.values()]
        .filter((row) => row.collectionId === collectionId)
        .map((row) => ({
          ...row,
          work: state.works.get(row.workId)!,
        })),
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
        const where = args.where as
          | {
              OR?: Array<
                | { audioEditionId?: string; ebookEditionId?: string; reviewStatus?: ReviewStatus }
                | { audioEditionId?: { in?: string[] }; ebookEditionId?: { in?: string[] } }
              >;
              reviewStatus?: ReviewStatus;
            }
          | undefined;
        const rows = [...state.audioLinks.values()].filter((row) => {
          if (where?.reviewStatus && row.reviewStatus !== where.reviewStatus) {
            return false;
          }
          if (!where?.OR) {
            return true;
          }
          return where.OR.some((clause) =>
            ("audioEditionId" in clause && typeof clause.audioEditionId === "object"
              ? clause.audioEditionId?.in?.includes(row.audioEditionId) ?? true
              : clause.audioEditionId === undefined || row.audioEditionId === clause.audioEditionId) &&
            ("ebookEditionId" in clause && typeof clause.ebookEditionId === "object"
              ? clause.ebookEditionId?.in?.includes(row.ebookEditionId) ?? true
              : clause.ebookEditionId === undefined || row.ebookEditionId === clause.ebookEditionId) &&
            (!("reviewStatus" in clause) || clause.reviewStatus === undefined || row.reviewStatus === clause.reviewStatus)
          );
        });
        return rows.map((row) => buildAudioLink(row.id)!);
      },
      async findUnique(args) {
        const where = args.where as { id: string };
        return buildAudioLink(where.id);
      },
      async update({ data, where }: { data: Record<string, unknown>; where: { id: string } }) {
        const row = state.audioLinks.get(where.id)!;
        state.audioLinks.set(where.id, { ...row, ...data } as typeof row);
        return buildAudioLink(where.id)!;
      },
    },
    collection: {
      async create(args) {
        const data = args.data as { kind: "MANUAL"; name: string; ownerUserId: string | null };
        const created = {
          id: `collection-created-${state.collections.size + 1}`,
          ...data,
        };
        state.collections.set(created.id, created);
        return created;
      },
      async deleteMany(args) {
        const where = args.where as { id?: string; ownerUserId?: string | null };
        let count = 0;
        for (const [id, row] of state.collections.entries()) {
          if (
            (where.id === undefined || row.id === where.id) &&
            (where.ownerUserId === undefined || row.ownerUserId === where.ownerUserId)
          ) {
            state.collections.delete(id);
            for (const [itemId, item] of state.collectionItems.entries()) {
              if (item.collectionId === id) {
                state.collectionItems.delete(itemId);
              }
            }
            count += 1;
          }
        }
        return { count };
      },
      async findMany(args) {
        const where = args.where as { ownerUserId?: string | null } | undefined;
        return [...state.collections.values()]
          .filter((row) => where?.ownerUserId === undefined || row.ownerUserId === where.ownerUserId)
          .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
          .map((row) => buildCollection(row.id)!);
      },
      async findUnique(args) {
        const where = args.where as { id?: string; ownerUserId?: string | null };
        const row = [...state.collections.values()].find((collection) =>
          (where.id === undefined || collection.id === where.id) &&
          (where.ownerUserId === undefined || collection.ownerUserId === where.ownerUserId),
        );
        return row ? buildCollection(row.id) : null;
      },
      async update(args) {
        const where = args.where as { id: string };
        const data = args.data as Record<string, unknown>;
        const existing = state.collections.get(where.id)!;
        const updated = { ...existing, ...data } as typeof existing;
        state.collections.set(where.id, updated);
        return updated;
      },
    },
    collectionItem: {
      async create(args) {
        const data = args.data as { collectionId: string; workId: string };
        const created = {
          collectionId: data.collectionId,
          id: `collection-item-created-${state.collectionItems.size + 1}`,
          workId: data.workId,
        };
        state.collectionItems.set(created.id, created);
        return created;
      },
      async delete({ where }) {
        state.collectionItems.delete(where.id);
        return {};
      },
      async findFirst(args) {
        const where = args.where as { collectionId?: string; workId?: string };
        return [...state.collectionItems.values()].find((row) =>
          (where.collectionId === undefined || row.collectionId === where.collectionId) &&
          (where.workId === undefined || row.workId === where.workId),
        ) ?? null;
      },
      async findMany(args) {
        const where = args.where as { collectionId?: string; workId?: string };
        return [...state.collectionItems.values()].filter((row) =>
          (where.collectionId === undefined || row.collectionId === where.collectionId) &&
          (where.workId === undefined || row.workId === where.workId),
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
      async create(args) {
        const data = args.data as {
          editionId: string;
          externalId: string;
          lastSyncedAt: Date | null;
          metadata: Record<string, unknown> | null;
          provider: string;
        };
        const created = {
          editionId: data.editionId,
          externalId: data.externalId,
          id: `external-link-created-${state.externalLinks.size + 1}`,
          lastSyncedAt: data.lastSyncedAt,
          metadata: data.metadata,
          provider: data.provider,
        };
        state.externalLinks.set(created.id, created);
        return created;
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
      async findUnique(args) {
        const where = args.where as { id: string };
        return state.externalLinks.get(where.id) ?? null;
      },
      async update({ data, where }) {
        const existing = state.externalLinks.get(where.id)!;
        const updated = { ...existing, ...data } as typeof existing;
        state.externalLinks.set(where.id, updated);
        return updated;
      },
    },
    readingProgress: {
      async create(args) {
        const data = args.data as TestState["readingProgress"] extends Map<string, infer TValue> ? TValue : never;
        const created = {
          ...data,
          id: `progress-created-${readingProgressIdCounter++}`,
          updatedAt: nextReadingProgressTimestamp(),
        };
        state.readingProgress.set(created.id, created);
        return created;
      },
      async delete({ where }) {
        state.readingProgress.delete(where.id);
        return {};
      },
      async deleteMany(args) {
        const where = args.where as {
          editionId?: string;
          progressKind?: "EBOOK" | "AUDIO" | "READALOUD";
          source?: string | null;
          userId?: string;
        };
        let count = 0;

        for (const [id, row] of state.readingProgress.entries()) {
          if (
            (where.userId === undefined || row.userId === where.userId) &&
            (where.editionId === undefined || row.editionId === where.editionId) &&
            (where.progressKind === undefined || row.progressKind === where.progressKind) &&
            (where.source === undefined || row.source === where.source)
          ) {
            state.readingProgress.delete(id);
            count += 1;
          }
        }

        return { count };
      },
      async findMany(args) {
        const where = args.where as {
          edition?: { workId?: string };
          editionId?: string | { in?: string[] };
          progressKind?: "EBOOK" | "AUDIO" | "READALOUD";
          source?: string | null;
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
            if (where.progressKind && row.progressKind !== where.progressKind) {
              return false;
            }
            if (where.source !== undefined && row.source !== where.source) {
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
        const updated = {
          ...existing,
          ...data,
          updatedAt: nextReadingProgressTimestamp(),
        } as typeof existing;
        state.readingProgress.set(where.id, updated);
        return updated;
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

  it("lists audio links, returns audio link details, and updates review status", async () => {
    const state = createState();
    addWork(state, "work-ebook", "The Fifth Season");
    addWork(state, "work-audio", "The Fifth Season");
    addContributor(state, "contributor-1", "N. K. Jemisin");
    addFileAsset(state, "file-1", "ebooks/fifth-season.epub", "hash-ebook");
    addFileAsset(state, "file-2", "audio/fifth-season.m4b", "hash-audio");
    addEdition(state, "edition-ebook", "work-ebook", { isbn13: "9780316498834" });
    addEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addEditionContributor(state, "edition-contributor-1", "edition-ebook", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-audio", "contributor-1");
    addEditionFile(state, "edition-file-1", "edition-ebook", "file-1");
    addEditionFile(state, "edition-file-2", "edition-audio", "file-2");
    state.audioLinks.set("audio-link-1", {
      audioEditionId: "edition-audio",
      confidence: 0.95,
      ebookEditionId: "edition-ebook",
      id: "audio-link-1",
      matchType: AudioLinkMatchType.EXACT_METADATA,
      reviewStatus: ReviewStatus.PENDING,
    });

    const db = createDb(state);
    const list = await listAudioLinks(db, { status: ReviewStatus.PENDING });
    const detail = await getAudioLinkDetail(db, "audio-link-1");
    const updated = await updateAudioLinkStatus(db, "audio-link-1", ReviewStatus.CONFIRMED);

    expect(list).toEqual([
      {
        audioLabel: "The Fifth Season (edition-audio)",
        audioWorkId: "work-audio",
        confidence: 0.95,
        ebookLabel: "The Fifth Season (edition-ebook)",
        ebookWorkId: "work-ebook",
        id: "audio-link-1",
        matchType: AudioLinkMatchType.EXACT_METADATA,
        reviewStatus: ReviewStatus.PENDING,
      },
    ]);
    expect(detail).toEqual({
      audioAuthors: ["N. K. Jemisin"],
      audioCreatedAt: "2025-01-01T00:00:00.000Z",
      audioFileCount: 1,
      audioHashes: ["hash-audio"],
      audioIsbns: [],
      audioLabel: "The Fifth Season (edition-audio)",
      audioPaths: ["audio/fifth-season.m4b"],
      audioUpdatedAt: "2025-01-02T00:00:00.000Z",
      audioWorkId: "work-audio",
      confidence: 0.95,
      ebookAuthors: ["N. K. Jemisin"],
      ebookCreatedAt: "2025-01-01T00:00:00.000Z",
      ebookFileCount: 1,
      ebookHashes: ["hash-ebook"],
      ebookIsbns: ["9780316498834"],
      ebookLabel: "The Fifth Season (edition-ebook)",
      ebookPaths: ["ebooks/fifth-season.epub"],
      ebookUpdatedAt: "2025-01-02T00:00:00.000Z",
      ebookWorkId: "work-ebook",
      id: "audio-link-1",
      matchType: AudioLinkMatchType.EXACT_METADATA,
      reviewStatus: ReviewStatus.PENDING,
    });
    expect(updated).toEqual({
      audioLabel: "The Fifth Season (edition-audio)",
      audioWorkId: "work-audio",
      confidence: 0.95,
      ebookLabel: "The Fifth Season (edition-ebook)",
      ebookWorkId: "work-ebook",
      id: "audio-link-1",
      matchType: AudioLinkMatchType.EXACT_METADATA,
      reviewStatus: ReviewStatus.CONFIRMED,
    });
    expect(state.audioLinks.get("audio-link-1")?.reviewStatus).toBe(ReviewStatus.CONFIRMED);
  });

  it("lists audio links without a status filter when ALL is requested", async () => {
    const state = createState();
    addWork(state, "work-ebook", "The Fifth Season");
    addWork(state, "work-audio", "The Fifth Season");
    addContributor(state, "contributor-1", "N. K. Jemisin");
    addFileAsset(state, "file-1", "ebooks/fifth-season.epub", "hash-ebook");
    addFileAsset(state, "file-2", "audio/fifth-season.m4b", "hash-audio");
    addEdition(state, "edition-ebook", "work-ebook");
    addEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addEditionContributor(state, "edition-contributor-1", "edition-ebook", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-audio", "contributor-1");
    addEditionFile(state, "edition-file-1", "edition-ebook", "file-1");
    addEditionFile(state, "edition-file-2", "edition-audio", "file-2");
    state.audioLinks.set("audio-link-1", {
      audioEditionId: "edition-audio",
      confidence: 1,
      ebookEditionId: "edition-ebook",
      id: "audio-link-1",
      matchType: AudioLinkMatchType.SAME_WORK,
      reviewStatus: ReviewStatus.IGNORED,
    });

    await expect(listAudioLinks(createDb(state), { status: "ALL" })).resolves.toEqual([
      {
        audioLabel: "The Fifth Season (edition-audio)",
        audioWorkId: "work-audio",
        confidence: 1,
        ebookLabel: "The Fifth Season (edition-ebook)",
        ebookWorkId: "work-ebook",
        id: "audio-link-1",
        matchType: AudioLinkMatchType.SAME_WORK,
        reviewStatus: ReviewStatus.IGNORED,
      },
    ]);
  });

  it("returns null for missing audio links and formats audio details from hydrated rows", async () => {
    const state = createState();
    addWork(state, "work-ebook", "Ebook");
    addWork(state, "work-audio", "Audio");
    addContributor(state, "contributor-1", "Author");
    addFileAsset(state, "file-1", "ebooks/book.epub", "hash-ebook");
    addFileAsset(state, "file-2", "audio/book.m4b", "hash-audio");
    addEdition(state, "edition-ebook", "work-ebook");
    addEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addEditionContributor(state, "edition-contributor-1", "edition-ebook", "contributor-1");
    addEditionContributor(state, "edition-contributor-2", "edition-audio", "contributor-1");
    addEditionFile(state, "edition-file-1", "edition-ebook", "file-1");
    addEditionFile(state, "edition-file-2", "edition-audio", "file-2");
    const hydratedAudioLink = {
      audioEdition: {
        ...state.editions.get("edition-audio")!,
        contributors: [
          {
            contributor: state.contributors.get("contributor-1")!,
            role: "AUTHOR" as const,
          },
        ],
        editionFiles: [
          {
            fileAsset: state.fileAssets.get("file-2")!,
          },
        ],
        work: state.works.get("work-audio")!,
      },
      audioEditionId: "edition-audio",
      confidence: 1,
      ebookEdition: {
        ...state.editions.get("edition-ebook")!,
        contributors: [
          {
            contributor: state.contributors.get("contributor-1")!,
            role: "AUTHOR" as const,
          },
        ],
        editionFiles: [
          {
            fileAsset: state.fileAssets.get("file-1")!,
          },
        ],
        work: state.works.get("work-ebook")!,
      },
      ebookEditionId: "edition-ebook",
      id: "audio-link-hydrated",
      matchType: AudioLinkMatchType.SAME_WORK,
      reviewStatus: ReviewStatus.PENDING,
    };

    await expect(getAudioLinkDetail(createDb(state), "missing-link")).resolves.toBeNull();
    expect(toAudioLinkDetail(hydratedAudioLink)).toEqual({
      audioAuthors: ["Author"],
      audioCreatedAt: "2025-01-01T00:00:00.000Z",
      audioFileCount: 1,
      audioHashes: ["hash-audio"],
      audioIsbns: [],
      audioLabel: "Audio (edition-audio)",
      audioPaths: ["audio/book.m4b"],
      audioUpdatedAt: "2025-01-02T00:00:00.000Z",
      audioWorkId: "work-audio",
      confidence: 1,
      ebookAuthors: ["Author"],
      ebookCreatedAt: "2025-01-01T00:00:00.000Z",
      ebookFileCount: 1,
      ebookHashes: ["hash-ebook"],
      ebookIsbns: [],
      ebookLabel: "Ebook (edition-ebook)",
      ebookPaths: ["ebooks/book.epub"],
      ebookUpdatedAt: "2025-01-02T00:00:00.000Z",
      ebookWorkId: "work-ebook",
      id: "audio-link-hydrated",
      matchType: AudioLinkMatchType.SAME_WORK,
      reviewStatus: ReviewStatus.PENDING,
    });
  });

  it("throws when audio link summary or detail rows are missing hydrated editions", async () => {
    expect(() =>
      toAudioLinkDetail({
        audioEdition: null,
        audioEditionId: "edition-audio",
        confidence: null,
        ebookEdition: null,
        ebookEditionId: "edition-ebook",
        id: "broken-audio-link",
        matchType: AudioLinkMatchType.SAME_WORK,
        reviewStatus: ReviewStatus.PENDING,
      }),
    ).toThrow('Audio link "broken-audio-link" is missing edition details');

    const brokenDb = createDb(createState());
    brokenDb.audioLink.findMany = async () => [{
      audioEdition: null,
      audioEditionId: "edition-audio",
      confidence: null,
      ebookEdition: null,
      ebookEditionId: "edition-ebook",
      id: "broken-audio-link",
      matchType: AudioLinkMatchType.SAME_WORK,
      reviewStatus: ReviewStatus.PENDING,
    }];

    await expect(
      listAudioLinks(brokenDb, { status: ReviewStatus.PENDING }),
    ).rejects.toThrow('Audio link "broken-audio-link" is missing edition details');
  });

  it("creates, updates, lists, and deletes external links", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addEdition(state, "edition-1", "work-1", {
      asin: "B123",
      isbn10: "0316498840",
      isbn13: "9780316498834",
      publishedAt: new Date("2015-08-04T00:00:00.000Z"),
      publisher: "Orbit",
    });
    addEdition(state, "edition-2", "work-1", {
      formatFamily: FormatFamily.AUDIOBOOK,
    });
    const db = createDb(state);

    const created = await createExternalLink(
      db,
      "edition-1",
      "openlibrary",
      "OL123",
      { rating: 5 },
      new Date("2025-01-05T12:00:00.000Z"),
    );

      expect(created).toEqual({
      editionId: "edition-1",
      externalId: "OL123",
      id: "external-link-created-1",
      lastSyncedAt: "2025-01-05T12:00:00.000Z",
      metadata: "{\n  \"rating\": 5\n}",
      provider: "openlibrary",
    });

    const updated = await updateExternalLink(
      db,
      "external-link-created-1",
      "goodreads",
      "GR456",
      { shelf: "favorites" },
      null,
    );

    expect(updated).toEqual({
      editionId: "edition-1",
      externalId: "GR456",
      id: "external-link-created-1",
      lastSyncedAt: null,
      metadata: "{\n  \"shelf\": \"favorites\"\n}",
      provider: "goodreads",
    });

    const grouped = await listExternalLinksForWork(db, "work-1");

    expect(grouped).toEqual([
      {
        asin: null,
        externalLinks: [],
        formatFamily: FormatFamily.AUDIOBOOK,
        id: "edition-2",
        isbn10: null,
        isbn13: null,
        publishedAt: null,
        publisher: null,
      },
      {
        asin: "B123",
        externalLinks: [updated],
        formatFamily: FormatFamily.EBOOK,
        id: "edition-1",
        isbn10: "0316498840",
        isbn13: "9780316498834",
        publishedAt: "2015-08-04T00:00:00.000Z",
        publisher: "Orbit",
      },
    ]);

    await deleteExternalLink(db, "external-link-created-1");

    expect(state.externalLinks.size).toBe(0);
  });

  it("rejects invalid external-link targets", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addEdition(state, "edition-1", "work-1");
    state.externalLinks.set("external-link-1", {
      editionId: "edition-1",
      externalId: "OL1",
      id: "external-link-1",
      lastSyncedAt: null,
      metadata: null,
      provider: "openlibrary",
    });
    const db = createDb(state);

    await expect(
      createExternalLink(db, "missing-edition", "openlibrary", "OL2", null, null),
    ).rejects.toThrow("Edition not found");
    await expect(
      updateExternalLink(db, "missing-link", "openlibrary", "OL3", null, null),
    ).rejects.toThrow("External link not found");
    await expect(
      deleteExternalLink(db, "missing-link"),
    ).rejects.toThrow("External link not found");
    await expect(
      listExternalLinksForWork(db, "missing-work"),
    ).rejects.toThrow("Work not found");
  });

  it("rejects updating an external link whose edition no longer exists", async () => {
    const state = createState();
    state.externalLinks.set("external-link-1", {
      editionId: "missing-edition",
      externalId: "OL1",
      id: "external-link-1",
      lastSyncedAt: null,
      metadata: null,
      provider: "openlibrary",
    });

    await expect(
      updateExternalLink(
        createDb(state),
        "external-link-1",
        "openlibrary",
        "OL2",
        { source: "manual" },
        null,
      ),
    ).rejects.toThrow("Edition not found");
  });

  it("handles null metadata, missing edition arrays, and fallback external-link maps", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addEdition(state, "edition-b", "work-1");
    addEdition(state, "edition-a", "work-1");
    state.externalLinks.set("external-link-1", {
      editionId: "edition-a",
      externalId: "OL1",
      id: "external-link-1",
      lastSyncedAt: null,
      metadata: null,
      provider: "openlibrary",
    });

    const db = createDb(state);
    await expect(listExternalLinksForWork(db, "work-1")).resolves.toEqual([
      expect.objectContaining({
        externalLinks: [
          expect.objectContaining({
            metadata: "",
          }),
        ],
        id: "edition-a",
      }),
      expect.objectContaining({
        externalLinks: [],
        id: "edition-b",
      }),
    ]);

    const workWithoutEditionsDb = createDb(state);
    workWithoutEditionsDb.work.findUnique = async () => ({
      id: "work-1",
      titleDisplay: "The Fifth Season",
    });
    await expect(listExternalLinksForWork(workWithoutEditionsDb, "work-1")).resolves.toEqual([]);

    const fallbackDb = createDb(state);
    fallbackDb.externalLink.findMany = async () => undefined as never;
    await expect(listExternalLinksForWork(fallbackDb, "work-1")).resolves.toEqual([
      expect.objectContaining({
        externalLinks: [],
        id: "edition-a",
      }),
      expect.objectContaining({
        externalLinks: [],
        id: "edition-b",
      }),
    ]);
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
    addCollection(state, "collection-1", "Favorites");
    addCollection(state, "collection-2", "Queued");
    state.collectionItems.set("collection-item-1", { collectionId: "collection-1", id: "collection-item-1", workId: "work-2" });
    state.collectionItems.set("collection-item-2", { collectionId: "collection-1", id: "collection-item-2", workId: "work-1" });
    state.collectionItems.set("collection-item-3", { collectionId: "collection-2", id: "collection-item-3", workId: "work-2" });
    state.externalLinks.set("external-link-1", { editionId: "edition-2", externalId: "abc", id: "external-link-1", lastSyncedAt: null, metadata: null, provider: "openlibrary" });
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
      matchType: AudioLinkMatchType.SAME_WORK,
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
    expect(state.collectionItems.has("collection-item-1")).toBe(false);
    expect(state.collectionItems.get("collection-item-3")?.workId).toBe("work-1");
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
    addCollection(state, "collection-1", "Shelf One");
    addCollection(state, "collection-2", "Shelf Two");
    state.collectionItems.set("collection-item-1", { collectionId: "collection-1", id: "collection-item-1", workId: "work-1" });
    state.collectionItems.set("collection-item-2", { collectionId: "collection-2", id: "collection-item-2", workId: "work-1" });
    state.externalLinks.set("external-link-1", { editionId: "edition-1", externalId: "dup", id: "external-link-1", lastSyncedAt: null, metadata: null, provider: "openlibrary" });
    state.externalLinks.set("external-link-2", { editionId: "edition-2", externalId: "dup", id: "external-link-2", lastSyncedAt: null, metadata: null, provider: "openlibrary" });
    state.externalLinks.set("external-link-3", { editionId: "edition-2", externalId: "unique", id: "external-link-3", lastSyncedAt: null, metadata: null, provider: "goodreads" });
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
    expect(state.collectionItems.get("collection-item-2")?.workId).toBe("work-1");
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
      matchType: AudioLinkMatchType.SAME_WORK,
      reviewStatus: ReviewStatus.PENDING,
    });
    state.audioLinks.set("audio-link-2", {
      audioEditionId: "audio-1",
      confidence: 0.8,
      ebookEditionId: "edition-1",
      id: "audio-link-2",
      matchType: AudioLinkMatchType.SAME_WORK,
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

  it("creates, renames, lists, loads, and deletes collections scoped to the user", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addWork(state, "work-2", "The Obelisk Gate");
    addWork(state, "work-3", "The Stone Sky");
    addCollection(state, "collection-1", "Favorites", "user-1");
    addCollection(state, "collection-2", "Archive", "user-2");
    state.collectionItems.set("collection-item-1", {
      collectionId: "collection-1",
      id: "collection-item-1",
      workId: "work-1",
    });
    state.collectionItems.set("collection-item-3", {
      collectionId: "collection-1",
      id: "collection-item-3",
      workId: "work-3",
    });
    state.collectionItems.set("collection-item-2", {
      collectionId: "collection-2",
      id: "collection-item-2",
      workId: "work-2",
    });

    const db = createDb(state);

    expect(await listCollections(db, "user-1")).toEqual([
      {
        id: "collection-1",
        itemCount: 2,
        kind: "MANUAL",
        name: "Favorites",
      },
    ]);

    expect(await getCollectionDetail(db, "user-1", "collection-1")).toEqual({
      id: "collection-1",
      itemCount: 2,
      kind: "MANUAL",
      name: "Favorites",
      works: [
        { id: "work-1", titleDisplay: "The Fifth Season" },
        { id: "work-3", titleDisplay: "The Stone Sky" },
      ],
    });
    expect(await getCollectionDetail(db, "user-1", "collection-2")).toBeNull();

    const created = await createCollection(db, "user-1", "Wishlist");
    expect(created).toMatchObject({
      itemCount: 0,
      kind: "MANUAL",
      name: "Wishlist",
    });

    await expect(renameCollection(db, "user-1", "collection-2", "Nope")).rejects.toThrow(
      "Collection not found",
    );
    expect(await renameCollection(db, "user-1", "collection-1", "Favorites Updated")).toEqual({
      id: "collection-1",
      itemCount: 2,
      kind: "MANUAL",
      name: "Favorites Updated",
    });

    await expect(deleteCollection(db, "user-1", "collection-2")).rejects.toThrow(
      "Collection not found",
    );
    await expect(deleteCollection(db, "user-1", "collection-1")).resolves.toBeUndefined();
    expect(state.collections.has("collection-1")).toBe(false);
    expect(state.collectionItems.has("collection-item-1")).toBe(false);
  });

  it("adds, removes, and reports work collection membership with ownership checks", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addCollection(state, "collection-1", "Favorites", "user-1");
    addCollection(state, "collection-2", "Reading", "user-1");
    addCollection(state, "collection-3", "Other User", "user-2");
    state.collectionItems.set("collection-item-1", {
      collectionId: "collection-1",
      id: "collection-item-1",
      workId: "work-1",
    });

    const db = createDb(state);

    await addWorkToCollection(db, "user-1", "collection-2", "work-1");
    await addWorkToCollection(db, "user-1", "collection-2", "work-1");
    expect(
      [...state.collectionItems.values()].filter((row) => row.collectionId === "collection-2" && row.workId === "work-1"),
    ).toHaveLength(1);

    await expect(addWorkToCollection(db, "user-1", "collection-3", "work-1")).rejects.toThrow(
      "Collection not found",
    );
    await expect(addWorkToCollection(db, "user-1", "collection-2", "missing-work")).rejects.toThrow(
      "Work not found",
    );

    expect(await getWorkCollectionMembership(db, "user-1", "work-1")).toEqual([
      {
        containsWork: true,
        id: "collection-1",
        itemCount: 1,
        kind: "MANUAL",
        name: "Favorites",
      },
      {
        containsWork: true,
        id: "collection-2",
        itemCount: 1,
        kind: "MANUAL",
        name: "Reading",
      },
    ]);

    await removeWorkFromCollection(db, "user-1", "collection-1", "work-1");
    await removeWorkFromCollection(db, "user-1", "collection-1", "work-1");
    expect(
      [...state.collectionItems.values()].some((row) => row.collectionId === "collection-1" && row.workId === "work-1"),
    ).toBe(false);
    await expect(removeWorkFromCollection(db, "user-1", "collection-3", "work-1")).rejects.toThrow(
      "Collection not found",
    );
    await expect(getWorkCollectionMembership(db, "user-1", "missing-work")).rejects.toThrow(
      "Work not found",
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
      collections: [],
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
    expect(view?.editions).toEqual([
      expect.objectContaining({ id: "edition-2" }),
      expect.objectContaining({ id: "edition-1" }),
    ]);

    expect(await updateWorkProgressTrackingMode(db, "user-1", "work-1", null)).toBeNull();
    expect((await getWorkProgressView(db, "user-1", "missing-work"))).toBeNull();
  });

  it("creates, updates, reads, and deletes reading progress rows by logical key", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addEdition(state, "edition-1", "work-1");
    const db = createDb(state);

    const created = await upsertReadingProgress(db, "user-1", {
      editionId: "edition-1",
      locator: { cfi: {} },
      percent: 0.25,
      progressKind: "EBOOK",
      source: "kobo",
    });

    expect(created).toMatchObject({
      editionId: "edition-1",
      locator: { cfi: {} },
      percent: 0.25,
      progressKind: "EBOOK",
      source: "kobo",
    });
    expect(state.readingProgress.size).toBe(1);

    const updated = await upsertReadingProgress(db, "user-1", {
      editionId: "edition-1",
      locator: { cfi: {}, chapter: {} },
      percent: 0.5,
      progressKind: "EBOOK",
      source: "kobo",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.locator).toEqual({ cfi: {}, chapter: {} });
    expect(updated.percent).toBe(0.5);
    expect(state.readingProgress.size).toBe(1);

    await expect(
      getReadingProgress(db, "user-1", {
        editionId: "edition-1",
        progressKind: "EBOOK",
        source: "kobo",
      }),
    ).resolves.toEqual(updated);

    await deleteReadingProgress(db, "user-1", {
      editionId: "edition-1",
      progressKind: "EBOOK",
      source: "kobo",
    });

    expect(state.readingProgress.size).toBe(0);
  });

  it("collapses duplicate reading progress rows and keeps null source separate", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addEdition(state, "edition-1", "work-1");
    state.readingProgress.set("progress-1", {
      editionId: "edition-1",
      id: "progress-1",
      locator: { cfi: {} },
      percent: 0.1,
      progressKind: "EBOOK",
      source: "kobo",
      updatedAt: new Date("2025-01-02T00:00:00.000Z"),
      userId: "user-1",
    });
    state.readingProgress.set("progress-2", {
      editionId: "edition-1",
      id: "progress-2",
      locator: { cfi: {} },
      percent: 0.2,
      progressKind: "EBOOK",
      source: "kobo",
      updatedAt: new Date("2025-01-03T00:00:00.000Z"),
      userId: "user-1",
    });
    state.readingProgress.set("progress-3", {
      editionId: "edition-1",
      id: "progress-3",
      locator: { cfi: {} },
      percent: 0.3,
      progressKind: "EBOOK",
      source: null,
      updatedAt: new Date("2025-01-04T00:00:00.000Z"),
      userId: "user-1",
    });
    const db = createDb(state);

    const updated = await upsertReadingProgress(db, "user-1", {
      editionId: "edition-1",
      locator: { cfi: {}, page: {} },
      percent: 0.6,
      progressKind: "EBOOK",
      source: "kobo",
    });

    expect(updated.id).toBe("progress-2");
    expect(state.readingProgress.has("progress-1")).toBe(false);
    expect(state.readingProgress.has("progress-2")).toBe(true);
    expect(state.readingProgress.has("progress-3")).toBe(true);
    expect(state.readingProgress.get("progress-2")?.percent).toBe(0.6);
    expect(state.readingProgress.get("progress-3")?.percent).toBe(0.3);
  });

  it("rejects invalid reading progress payloads and normalizes legacy locators on read", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season");
    addEdition(state, "edition-1", "work-1");
    state.readingProgress.set("progress-1", {
      editionId: "edition-1",
      id: "progress-1",
      locator: null as unknown as Record<string, object>,
      percent: 0.25,
      progressKind: "EBOOK",
      source: null,
      updatedAt: new Date("2025-01-03T00:00:00.000Z"),
      userId: "user-1",
    });
    const db = createDb(state);

    await expect(
      getReadingProgress(db, "user-1", {
        editionId: "edition-1",
        progressKind: "EBOOK",
        source: null,
      }),
    ).resolves.toMatchObject({
      locator: {},
    });

    await expect(
      upsertReadingProgress(db, "user-1", {
        editionId: "edition-1",
        locator: { cfi: "bad" as unknown as object },
        percent: 0.2,
        progressKind: "EBOOK",
        source: null,
      }),
    ).rejects.toThrow("Reading progress locator must be an object whose values are objects");

    await expect(
      upsertReadingProgress(db, "user-1", {
        editionId: "edition-1",
        locator: { cfi: {} },
        percent: 1.5,
        progressKind: "EBOOK",
        source: null,
      }),
    ).rejects.toThrow("Reading progress percent must be between 0 and 1");

    await expect(
      getReadingProgress(db, "user-1", {
        editionId: "missing-edition",
        progressKind: "EBOOK",
        source: null,
      }),
    ).resolves.toBeNull();
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
      editions: [],
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
      matchType: AudioLinkMatchType.SAME_WORK,
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
