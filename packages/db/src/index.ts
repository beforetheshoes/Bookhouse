import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

process.env.DATABASE_URL ||= "postgresql://bookhouse:bookhouse@localhost:5432/bookhouse";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export {
  AudioLinkMatchType,
  AvailabilityStatus,
  CollectionKind,
  ContributorRole,
  DuplicateReason,
  EditionFileRole,
  FormatFamily,
  ImportJobKind,
  ImportJobStatus,
  LibraryRootKind,
  MediaKind,
  ProgressKind,
  ProgressTrackingMode,
  ReviewStatus,
  ScanMode,
  PrismaClient,
} from "@prisma/client";

export type {
  AudioLink,
  Collection,
  CollectionItem,
  Contributor,
  DuplicateCandidate,
  Edition,
  EditionContributor,
  EditionFile,
  ExternalLink,
  FileAsset,
  ImportJob,
  LibraryRoot,
  Prisma,
  ReadingProgress,
  Series,
  User,
  UserIdentity,
  UserPreference,
  UserRole,
  Work,
  WorkProgressPreference,
} from "@prisma/client";
