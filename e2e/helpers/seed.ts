import { db } from "@bookhouse/db";

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("_test")) {
    throw new Error(
      `SAFETY: Refusing to clean database. DATABASE_URL must point to a "_test" database ` +
      `to prevent accidental data loss. Current URL: "${url}"`,
    );
  }
}

export async function cleanDatabase() {
  assertTestDatabase();
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "ImportJob",
                   "DuplicateCandidate",
                   "MatchSuggestion",
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
  assertTestDatabase();
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "ImportJob",
                   "DuplicateCandidate",
                   "MatchSuggestion",
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

  // Ensure a library root exists for the file asset foreign key
  const libraryRoot = await db.libraryRoot.upsert({
    where: { path: "/tmp/e2e-seed-library" },
    create: {
      name: "E2E Seed Library",
      path: "/tmp/e2e-seed-library",
      kind: "EBOOKS",
      scanMode: "FULL",
    },
    update: {},
  });

  const slug = title.toLowerCase().replace(/\s+/g, "-");

  return db.work.create({
    data: {
      titleCanonical: title.toLowerCase(),
      titleDisplay: title,
      sortTitle: title.toLowerCase(),
      editions: {
        create: {
          formatFamily: "EBOOK",
          editionFiles: {
            create: {
              role: "PRIMARY",
              fileAsset: {
                create: {
                  libraryRootId: libraryRoot.id,
                  absolutePath: `/tmp/e2e-seed-library/${slug}.epub`,
                  relativePath: `${slug}.epub`,
                  basename: `${slug}.epub`,
                  extension: "epub",
                  mediaKind: "EPUB",
                  availabilityStatus: "PRESENT",
                },
              },
            },
          },
        },
      },
    },
    include: { editions: true },
  });
}

export async function seedImportJob(
  libraryRootId: string,
  overrides: {
    kind?: "SCAN_ROOT" | "HASH_FILE" | "PARSE_FILE" | "DETECT_DUPLICATES" | "MATCH_SUGGESTIONS";
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
