import { db } from "@bookhouse/db";

export async function cleanDatabase() {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "ImportJob",
                   "DuplicateCandidate",
                   "AudioLink",
                   "ExternalLink",
                   "ReadingProgress",
                   "WorkProgressPreference",
                   "UserPreference",
                   "CollectionItem",
                   "Collection",
                   "EditionContributor",
                   "EditionFile",
                   "Contributor",
                   "Edition",
                   "Work",
                   "Series",
                   "FileAsset",
                   "LibraryRoot",
                   "UserRole",
                   "UserIdentity",
                   "User"
    CASCADE
  `);
}

/**
 * Cleans test-specific data (library roots, works, jobs, etc.) while
 * preserving the authenticated user so session cookies remain valid
 * across tests in the same run.
 */
export async function cleanTestData() {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "ImportJob",
                   "DuplicateCandidate",
                   "AudioLink",
                   "ExternalLink",
                   "ReadingProgress",
                   "WorkProgressPreference",
                   "UserPreference",
                   "CollectionItem",
                   "Collection",
                   "EditionContributor",
                   "EditionFile",
                   "Contributor",
                   "Edition",
                   "Work",
                   "Series",
                   "FileAsset",
                   "LibraryRoot"
    CASCADE
  `);
}

export async function seedLibraryRoot(
  overrides: {
    name?: string;
    path?: string;
    kind?: "EBOOKS" | "AUDIOBOOKS" | "MIXED";
    scanMode?: "FULL" | "INCREMENTAL";
  } = {},
) {
  return db.libraryRoot.create({
    data: {
      name: overrides.name ?? "E2E Test Library",
      path: overrides.path ?? "/tmp/e2e-test-library",
      kind: overrides.kind ?? "EBOOKS",
      scanMode: overrides.scanMode ?? "FULL",
    },
  });
}

export async function seedWork(overrides: { title?: string } = {}) {
  const title = overrides.title ?? "E2E Test Book";
  return db.work.create({
    data: {
      titleCanonical: title.toLowerCase(),
      titleDisplay: title,
      sortTitle: title.toLowerCase(),
      editions: {
        create: {
          formatFamily: "EBOOK",
        },
      },
    },
    include: { editions: true },
  });
}

export async function seedImportJob(
  libraryRootId: string,
  overrides: {
    kind?: "SCAN_ROOT" | "HASH_FILE" | "PARSE_FILE" | "REFRESH_METADATA" | "DETECT_DUPLICATES" | "MATCH_AUDIO";
    status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  } = {},
) {
  return db.importJob.create({
    data: {
      libraryRootId,
      kind: overrides.kind ?? "SCAN_ROOT",
      status: overrides.status ?? "SUCCEEDED",
      startedAt: new Date(Date.now() - 30_000),
      finishedAt:
        overrides.status === "RUNNING" ? undefined : new Date(),
      attemptsMade: 1,
    },
  });
}

export async function findE2EUser() {
  return db.user.findFirst({
    where: { email: "e2e@bookhouse.test" },
  });
}
