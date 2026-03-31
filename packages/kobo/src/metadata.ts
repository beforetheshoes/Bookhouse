import { createHash } from "node:crypto";
import type { EligibleEdition, KoboEntitlement, KoboBookMetadata, KoboContentUrls } from "./types";

export interface MetadataOptions {
  baseUrl: string;
  deviceToken: string;
}

/**
 * Converts any string ID (e.g. CUID) into a deterministic UUID-format string
 * using the first 128 bits of its SHA-256 hash.
 */
export function toKoboId(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

export function buildEntitlement(
  edition: EligibleEdition,
  options: MetadataOptions,
): KoboEntitlement {
  const bookMetadata = buildBookMetadata(edition, options);
  const now = new Date().toISOString();

  return {
    BookEntitlement: {
      Accessibility: "Full",
      ActivePeriod: { From: edition.publishedAt?.toISOString() ?? now },
      Created: now,
      CrossRevisionId: edition.id,
      Id: edition.id,
      IsHiddenFromArchive: false,
      IsLocked: false,
      IsRemoved: false,
      LastModified: now,
      OriginCategory: "Imported",
      RevisionId: edition.id,
      Status: "Active",
    },
    BookMetadata: bookMetadata,
    ReadingState: {
      EntitlementId: edition.id,
      Created: now,
      LastModified: now,
      PriorityTimestamp: now,
      StatusInfo: {
        LastModified: now,
        Status: "ReadyToRead",
        TimesStartedReading: 0,
      },
      Statistics: {
        LastModified: now,
      },
      CurrentBookmark: {
        LastModified: now,
      },
    },
  };
}

export function buildBookMetadata(
  edition: EligibleEdition,
  options: MetadataOptions,
): KoboBookMetadata {
  const downloadUrls = edition.primaryFilePath
    ? [
        {
          DRMType: "None",
          Format: "KEPUB",
          Platform: "Generic",
          Size: edition.primaryFileSize ?? 0,
          Url: `${options.baseUrl}/kobo/${options.deviceToken}/v1/library/${edition.id}/download`,
        },
      ]
    : [];

  const metadata: KoboBookMetadata = {
    Categories: ["00000000-0000-0000-0000-000000000001"],
    ContributorRoles: edition.contributors.map((c) => ({
      Name: c.name,
    })),
    Contributors: edition.contributors.map((c) => c.name),
    CoverImageId: `${edition.id}-v3`,
    CrossRevisionId: edition.id,
    CurrentDisplayPrice: { CurrencyCode: "USD", TotalAmount: 0 },
    CurrentLoveDisplayPrice: { TotalAmount: 0 },
    Description: edition.description ?? "",
    DownloadUrls: downloadUrls,
    EntitlementId: edition.id,
    ExternalIds: [],
    Genre: "00000000-0000-0000-0000-000000000001",
    IsEligibleForKoboLove: false,
    IsInternetArchive: false,
    IsPreOrder: false,
    IsSocialEnabled: false,
    Language: edition.language ?? "en",
    PhoneticPronunciations: {},
    PublicationDate: edition.publishedAt?.toISOString() ?? new Date().toISOString(),
    Publisher: {
      Imprint: edition.publisher ?? "",
      Name: edition.publisher ?? "",
    },
    RevisionId: edition.id,
    Title: edition.title,
    WorkId: edition.workId,
  };

  if (edition.seriesName) {
    metadata.Series = {
      Name: edition.seriesName,
      Number: edition.seriesPosition ?? 0,
      NumberFloat: edition.seriesPosition ?? 0,
      Id: `series-${edition.workId}`,
    };
  }

  return metadata;
}

export function buildContentUrls(
  editionId: string,
  options: MetadataOptions,
): KoboContentUrls {
  const base = `${options.baseUrl}/kobo/${options.deviceToken}/v1/library/${editionId}`;
  return {
    BookCover: `${base}/cover`,
    BookCoverThumbnail: `${base}/cover`,
  };
}
