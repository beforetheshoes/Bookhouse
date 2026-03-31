export interface KoboReadingState {
  EntitlementId: string;
  Created: string;
  LastModified: string;
  PriorityTimestamp: string;
  StatusInfo: {
    LastModified: string;
    Status: string;
    TimesStartedReading: number;
  };
  Statistics: {
    LastModified: string;
  };
  CurrentBookmark: {
    LastModified: string;
    Location?: KoboLocation | null;
    ProgressPercent?: number;
  };
}

export interface KoboEntitlement {
  BookEntitlement: {
    Accessibility: string;
    ActivePeriod: { From: string };
    Created: string;
    CrossRevisionId: string;
    Id: string;
    IsHiddenFromArchive: boolean;
    IsLocked: boolean;
    IsRemoved: boolean;
    LastModified: string;
    OriginCategory: string;
    RevisionId: string;
    Status: string;
  };
  BookMetadata: KoboBookMetadata;
  ReadingState: KoboReadingState;
}

export interface KoboBookMetadata {
  Categories: string[];
  ContributorRoles: KoboContributorRole[];
  Contributors: string[];
  CoverImageId: string;
  CrossRevisionId: string;
  CurrentDisplayPrice: { CurrencyCode: string; TotalAmount: number };
  CurrentLoveDisplayPrice: { TotalAmount: number };
  Description: string;
  DownloadUrls: KoboDownloadUrl[];
  EntitlementId: string;
  ExternalIds: never[];
  Genre: string;
  IsEligibleForKoboLove: boolean;
  IsInternetArchive: boolean;
  IsPreOrder: boolean;
  IsSocialEnabled: boolean;
  Language: string;
  PhoneticPronunciations: Record<string, never>;
  PublicationDate: string;
  Publisher: { Imprint: string; Name: string };
  RevisionId: string;
  Series?: { Name: string; Number: number; NumberFloat: number; Id: string };
  Title: string;
  WorkId: string;
}

export interface KoboContributorRole {
  Name: string;
}

export interface KoboDownloadUrl {
  DRMType: string;
  Format: string;
  Platform: string;
  Size: number;
  Url: string;
}

export interface KoboContentUrls {
  BookCover: string;
  BookCoverThumbnail: string;
}

export interface SyncToken {
  lastSyncAt: string;
  archive: boolean;
}

export interface SyncResult {
  newEntitlements: KoboEntitlement[];
  removedIds: string[];
  changedReadingStates: KoboReadingState[];
}

export interface KoboRequestResult {
  RequestResult: string;
  UpdateResults: KoboUpdateResult[];
}

export interface KoboUpdateResult {
  EntitlementId: string;
  CurrentBookmarkResult: { Result: string };
  StatisticsResult: { Result: string };
  StatusInfoResult: { Result: string };
}

export type LocatorValue = string | number | boolean | null | LocatorValue[] | { [key: string]: LocatorValue };

export interface KoboLocation {
  Source: string;
  Type: string;
  Value: string;
}

export interface LocatorData {
  koboLocation?: KoboLocation;
}

export interface ReadingProgressRecord {
  id: string;
  userId: string;
  editionId: string;
  progressKind: string;
  locator: LocatorData;
  percent: number | null;
  source: string | null;
  updatedAt: Date;
}

export interface KoboStateUpdatePayload {
  status: string;
  progress: number;
  location: KoboLocation | null;
  lastModified: string;
}

export interface EligibleEdition {
  id: string;
  workId: string;
  title: string;
  description: string | null;
  coverPath: string | null;
  publisher: string | null;
  publishedAt: Date | null;
  isbn13: string | null;
  language: string | null;
  pageCount: number | null;
  seriesName: string | null;
  seriesPosition: number | null;
  contributors: { name: string; role: string }[];
  primaryFilePath: string | null;
  primaryFileSize: number | null;
  primaryFileMimeType: string | null;
}
