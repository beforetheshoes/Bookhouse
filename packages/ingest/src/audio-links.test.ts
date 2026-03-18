import { describe, expect, it } from "vitest";
import {
  AudioLinkMatchType,
  ContributorRole,
  EditionFileRole,
  FormatFamily,
  MediaKind,
  ReviewStatus,
} from "@bookhouse/domain";
import { AUDIO_LINK_INTERNALS, createIngestServices, type IngestDb } from "./index";

type TestWork = {
  id: string;
  sortTitle: string | null;
  titleCanonical: string;
  titleDisplay: string;
};

type TestContributor = {
  id: string;
  nameCanonical: string;
  nameDisplay: string;
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

type TestFileAsset = {
  absolutePath: string;
  availabilityStatus: "PRESENT";
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

type TestAudioLink = {
  audioEditionId: string;
  confidence: number | null;
  ebookEditionId: string;
  id: string;
  matchType: AudioLinkMatchType;
  reviewStatus: ReviewStatus;
};

type AudioLinkState = {
  audioLinks: Map<string, TestAudioLink>;
  contributors: Map<string, TestContributor>;
  editionContributors: Map<string, TestEditionContributor>;
  editionFiles: Map<string, TestEditionFile>;
  editions: Map<string, TestEdition>;
  fileAssets: Map<string, TestFileAsset>;
  works: Map<string, TestWork>;
};

function createState(): AudioLinkState {
  return {
    audioLinks: new Map(),
    contributors: new Map(),
    editionContributors: new Map(),
    editionFiles: new Map(),
    editions: new Map(),
    fileAssets: new Map(),
    works: new Map(),
  };
}

function addWork(
  state: AudioLinkState,
  id: string,
  titleDisplay: string,
  titleCanonical = titleDisplay.toLowerCase(),
): void {
  state.works.set(id, {
    id,
    sortTitle: null,
    titleCanonical,
    titleDisplay,
  });
}

function addContributor(state: AudioLinkState, id: string, nameDisplay: string, nameCanonical: string): void {
  state.contributors.set(id, { id, nameCanonical, nameDisplay });
}

function addEdition(
  state: AudioLinkState,
  id: string,
  workId: string,
  formatFamily: FormatFamily,
): void {
  state.editions.set(id, {
    asin: null,
    formatFamily,
    id,
    isbn10: null,
    isbn13: null,
    publishedAt: null,
    publisher: null,
    workId,
  });
}

function addEditionContributor(
  state: AudioLinkState,
  id: string,
  editionId: string,
  contributorId: string,
): void {
  state.editionContributors.set(id, {
    contributorId,
    editionId,
    id,
    role: ContributorRole.AUTHOR,
  });
}

function addFileAsset(
  state: AudioLinkState,
  id: string,
  libraryRootId: string,
  relativePath: string,
): void {
  state.fileAssets.set(id, {
    absolutePath: `/library/${relativePath}`,
    availabilityStatus: "PRESENT",
    fullHash: null,
    id,
    libraryRootId,
    mediaKind: MediaKind.EPUB,
    metadata: null,
    mtime: new Date("2025-01-01T00:00:00.000Z"),
    partialHash: null,
    relativePath,
    sizeBytes: 10n,
  });
}

function addEditionFile(
  state: AudioLinkState,
  id: string,
  editionId: string,
  fileAssetId: string,
): void {
  state.editionFiles.set(id, {
    editionId,
    fileAssetId,
    id,
    role: EditionFileRole.PRIMARY,
  });
}

function createAudioLinkDb(state: AudioLinkState): IngestDb {
  let audioLinkSequence = state.audioLinks.size;

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
        const where = (args.where ?? {}) as { libraryRootId?: string };
        return [...state.fileAssets.values()].filter((fileAsset) =>
          where.libraryRootId === undefined || fileAsset.libraryRootId === where.libraryRootId
        );
      },
      async findUnique() {
        throw new Error("unused");
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
          fileAssetIds.size === 0 || fileAssetIds.has(editionFile.fileAssetId)
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
    audioLink: {
      async create({ data }: { data: Omit<TestAudioLink, "id"> }) {
        audioLinkSequence += 1;
        const audioLink: TestAudioLink = {
          ...data,
          id: `audio-link-${audioLinkSequence}`,
        };
        state.audioLinks.set(audioLink.id, audioLink);
        return audioLink;
      },
      async findMany(args: Record<string, unknown>) {
        const where = (args.where ?? {}) as {
          OR?: Array<
            | { audioEditionId?: { in?: string[] }; ebookEditionId?: { in?: string[] } }
            | { OR?: Array<{ audioEditionId?: { in?: string[] }; ebookEditionId?: { in?: string[] } }> }
          >;
        };

        if (!where.OR || where.OR.length === 0) {
          return [...state.audioLinks.values()];
        }

        const matchesClause = (
          audioLink: TestAudioLink,
          clause: { audioEditionId?: { in?: string[] }; ebookEditionId?: { in?: string[] } },
        ) => {
          const audioIds = clause.audioEditionId?.in;
          const ebookIds = clause.ebookEditionId?.in;
          return (audioIds === undefined || audioIds.includes(audioLink.audioEditionId)) &&
            (ebookIds === undefined || ebookIds.includes(audioLink.ebookEditionId));
        };

        return [...state.audioLinks.values()].filter((audioLink) =>
          where.OR!.some((clause) => {
            if ("OR" in clause) {
              return (clause.OR ?? []).some((nestedClause) => matchesClause(audioLink, nestedClause));
            }

            return matchesClause(
              audioLink,
              clause as { audioEditionId?: { in?: string[] }; ebookEditionId?: { in?: string[] } },
            );
          })
        );
      },
      async update({ data, where }: { data: Partial<TestAudioLink>; where: { id: string } }) {
        const existing = state.audioLinks.get(where.id);

        if (!existing) {
          throw new Error(`Unknown audio link ${where.id}`);
        }

        const updated = {
          ...existing,
          ...data,
        };
        state.audioLinks.set(updated.id, updated);
        return updated;
      },
    },
  } as unknown as IngestDb;
}

describe("audio link matching", () => {
  it("creates a pending same-work audio link for ebook and audiobook editions", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season", "the fifth season");
    addContributor(state, "contributor-1", "N. K. Jemisin", "n k jemisin");
    addEdition(state, "ebook-1", "work-1", FormatFamily.EBOOK);
    addEdition(state, "audio-1", "work-1", FormatFamily.AUDIOBOOK);
    addEditionContributor(state, "link-1", "ebook-1", "contributor-1");
    addEditionContributor(state, "link-2", "audio-1", "contributor-1");

    const services = createIngestServices({
      db: createAudioLinkDb(state),
      enqueueLibraryJob: async () => undefined,
    });

    const result = await services.matchAudioLinks({ ebookEditionId: "ebook-1" });

    expect(result).toEqual({
      createdAudioLinkIds: ["audio-link-1"],
      ignoredAudioLinkIds: [],
      scannedAudioEditionIds: ["audio-1"],
      scannedEbookEditionIds: ["ebook-1"],
      updatedAudioLinkIds: [],
    });
    expect([...state.audioLinks.values()]).toEqual([
      {
        audioEditionId: "audio-1",
        confidence: 1,
        ebookEditionId: "ebook-1",
        id: "audio-link-1",
        matchType: AudioLinkMatchType.SAME_WORK,
        reviewStatus: ReviewStatus.PENDING,
      },
    ]);
  });

  it("returns an empty result when a library-root recompute has no scoped files or editions", async () => {
    const services = createIngestServices({
      db: createAudioLinkDb(createState()),
      enqueueLibraryJob: async () => undefined,
    });

    await expect(services.matchAudioLinks({ libraryRootId: "root-empty" })).resolves.toEqual({
      createdAudioLinkIds: [],
      ignoredAudioLinkIds: [],
      scannedAudioEditionIds: [],
      scannedEbookEditionIds: [],
      updatedAudioLinkIds: [],
    });
  });

  it("creates an exact-metadata link across works when title and authors match exactly", async () => {
    const state = createState();
    addWork(state, "work-ebook", "The Fifth Season", "the fifth season");
    addWork(state, "work-audio", "The Fifth Season", "the fifth season");
    addContributor(state, "contributor-1", "N. K. Jemisin", "n k jemisin");
    addEdition(state, "ebook-1", "work-ebook", FormatFamily.EBOOK);
    addEdition(state, "audio-1", "work-audio", FormatFamily.AUDIOBOOK);
    addEditionContributor(state, "link-1", "ebook-1", "contributor-1");
    addEditionContributor(state, "link-2", "audio-1", "contributor-1");

    const services = createIngestServices({
      db: createAudioLinkDb(state),
      enqueueLibraryJob: async () => undefined,
    });

    await services.matchAudioLinks({ audioEditionId: "audio-1" });

    expect([...state.audioLinks.values()][0]).toMatchObject({
      audioEditionId: "audio-1",
      confidence: 0.95,
      ebookEditionId: "ebook-1",
      matchType: AudioLinkMatchType.EXACT_METADATA,
    });
  });

  it("does not create links when title or author metadata does not match", async () => {
    const state = createState();
    addWork(state, "work-ebook", "The Fifth Season", "the fifth season");
    addWork(state, "work-audio", "The Obelisk Gate", "the obelisk gate");
    addContributor(state, "contributor-1", "N. K. Jemisin", "n k jemisin");
    addContributor(state, "contributor-2", "Different Author", "different author");
    addEdition(state, "ebook-1", "work-ebook", FormatFamily.EBOOK);
    addEdition(state, "audio-1", "work-audio", FormatFamily.AUDIOBOOK);
    addEditionContributor(state, "link-1", "ebook-1", "contributor-1");
    addEditionContributor(state, "link-2", "audio-1", "contributor-2");

    const services = createIngestServices({
      db: createAudioLinkDb(state),
      enqueueLibraryJob: async () => undefined,
    });

    const result = await services.matchAudioLinks({ ebookEditionId: "ebook-1" });

    expect(result.createdAudioLinkIds).toEqual([]);
    expect([...state.audioLinks.values()]).toEqual([]);
  });

  it("rejects invalid format pairs and self-links through the internal matcher", () => {
    const baseEdition = {
      asin: null,
      contributors: [],
      editionFiles: [],
      formatFamily: FormatFamily.EBOOK,
      id: "edition-1",
      isbn10: null,
      isbn13: null,
      publishedAt: null,
      publisher: null,
      work: {
        id: "work-1",
        titleDisplay: "Work",
      },
      workId: "work-1",
    };

    expect(AUDIO_LINK_INTERNALS.canLinkAudioEditions(baseEdition as never, baseEdition as never)).toBeUndefined();
    expect(
      AUDIO_LINK_INTERNALS.canLinkAudioEditions(
        baseEdition as never,
        {
          ...baseEdition,
          formatFamily: FormatFamily.EBOOK,
          id: "edition-2",
          workId: "work-2",
          work: {
            id: "work-2",
            titleDisplay: "Other Work",
          },
        } as never,
      ),
    ).toBeUndefined();
    expect(
      AUDIO_LINK_INTERNALS.canLinkAudioEditions(
        baseEdition as never,
        {
          ...baseEdition,
          formatFamily: FormatFamily.AUDIOBOOK,
          id: "edition-1",
          workId: "work-2",
          work: {
            id: "work-2",
            titleDisplay: "Audio Work",
          },
        } as never,
      ),
    ).toBeUndefined();
  });

  it("is idempotent and preserves confirmed review status on recompute", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season", "the fifth season");
    addContributor(state, "contributor-1", "N. K. Jemisin", "n k jemisin");
    addEdition(state, "ebook-1", "work-1", FormatFamily.EBOOK);
    addEdition(state, "audio-1", "work-1", FormatFamily.AUDIOBOOK);
    addEditionContributor(state, "link-1", "ebook-1", "contributor-1");
    addEditionContributor(state, "link-2", "audio-1", "contributor-1");

    const services = createIngestServices({
      db: createAudioLinkDb(state),
      enqueueLibraryJob: async () => undefined,
    });

    await services.matchAudioLinks({ ebookEditionId: "ebook-1" });
    state.audioLinks.set("audio-link-1", {
      ...state.audioLinks.get("audio-link-1")!,
      reviewStatus: ReviewStatus.CONFIRMED,
    });

    const secondResult = await services.matchAudioLinks({ ebookEditionId: "ebook-1" });

    expect(secondResult).toEqual({
      createdAudioLinkIds: [],
      ignoredAudioLinkIds: [],
      scannedAudioEditionIds: ["audio-1"],
      scannedEbookEditionIds: ["ebook-1"],
      updatedAudioLinkIds: ["audio-link-1"],
    });
    expect(state.audioLinks.get("audio-link-1")?.reviewStatus).toBe(ReviewStatus.CONFIRMED);
  });

  it("supports full-library and targeted recompute and ignores stale pending links", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season", "the fifth season");
    addWork(state, "work-2", "The Stone Sky", "the stone sky");
    addContributor(state, "contributor-1", "N. K. Jemisin", "n k jemisin");
    addEdition(state, "ebook-1", "work-1", FormatFamily.EBOOK);
    addEdition(state, "audio-1", "work-1", FormatFamily.AUDIOBOOK);
    addEdition(state, "ebook-2", "work-2", FormatFamily.EBOOK);
    addEdition(state, "audio-2", "work-2", FormatFamily.AUDIOBOOK);
    addEditionContributor(state, "link-1", "ebook-1", "contributor-1");
    addEditionContributor(state, "link-2", "audio-1", "contributor-1");
    addEditionContributor(state, "link-3", "ebook-2", "contributor-1");
    addEditionContributor(state, "link-4", "audio-2", "contributor-1");
    addFileAsset(state, "file-1", "root-1", "one.epub");
    addFileAsset(state, "file-2", "root-1", "one.m4b");
    addFileAsset(state, "file-3", "root-1", "two.epub");
    addFileAsset(state, "file-4", "root-1", "two.m4b");
    addEditionFile(state, "edition-file-1", "ebook-1", "file-1");
    addEditionFile(state, "edition-file-2", "audio-1", "file-2");
    addEditionFile(state, "edition-file-3", "ebook-2", "file-3");
    addEditionFile(state, "edition-file-4", "audio-2", "file-4");
    state.audioLinks.set("audio-link-99", {
      audioEditionId: "audio-2",
      confidence: 0.95,
      ebookEditionId: "ebook-1",
      id: "audio-link-99",
      matchType: AudioLinkMatchType.EXACT_METADATA,
      reviewStatus: ReviewStatus.PENDING,
    });

    const services = createIngestServices({
      db: createAudioLinkDb(state),
      enqueueLibraryJob: async () => undefined,
    });

    const fullResult = await services.matchAudioLinks({ libraryRootId: "root-1" });
    const targetedResult = await services.matchAudioLinks({ ebookEditionId: "ebook-2" });

    expect(fullResult.createdAudioLinkIds).toHaveLength(2);
    expect(fullResult.ignoredAudioLinkIds).toEqual(["audio-link-99"]);
    expect(fullResult.scannedEbookEditionIds).toEqual(["ebook-1", "ebook-2"]);
    expect(fullResult.scannedAudioEditionIds).toEqual(["audio-1", "audio-2"]);
    expect(targetedResult.createdAudioLinkIds).toEqual([]);
    expect(targetedResult.updatedAudioLinkIds).toContain("audio-link-3");
    expect(state.audioLinks.get("audio-link-99")?.reviewStatus).toBe(ReviewStatus.IGNORED);
  });

  it("leaves stale non-pending audio links untouched during recompute", async () => {
    const state = createState();
    addWork(state, "work-1", "The Fifth Season", "the fifth season");
    addContributor(state, "contributor-1", "N. K. Jemisin", "n k jemisin");
    addEdition(state, "ebook-1", "work-1", FormatFamily.EBOOK);
    addEdition(state, "audio-1", "work-1", FormatFamily.AUDIOBOOK);
    addEditionContributor(state, "link-1", "ebook-1", "contributor-1");
    addEditionContributor(state, "link-2", "audio-1", "contributor-1");
    state.audioLinks.set("audio-link-1", {
      audioEditionId: "audio-missing",
      confidence: 0.5,
      ebookEditionId: "ebook-1",
      id: "audio-link-1",
      matchType: AudioLinkMatchType.EXACT_METADATA,
      reviewStatus: ReviewStatus.CONFIRMED,
    });

    const services = createIngestServices({
      db: createAudioLinkDb(state),
      enqueueLibraryJob: async () => undefined,
    });

    const result = await services.matchAudioLinks({ ebookEditionId: "ebook-1" });

    expect(result.ignoredAudioLinkIds).toEqual([]);
    expect(state.audioLinks.get("audio-link-1")?.reviewStatus).toBe(ReviewStatus.CONFIRMED);
  });
});
