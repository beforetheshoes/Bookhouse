import {
  type AuthenticatedUser,
} from "@bookhouse/auth";
import {
  ContributorRole,
  EditionFileRole,
  FormatFamily,
  MediaKind,
  ProgressTrackingMode,
} from "@bookhouse/domain";
import type { LibraryWorkSummary, WorkProgressView } from "./library-service";

export function isE2eFixtureMode(): boolean {
  return process.env.BOOKHOUSE_E2E_FIXTURES === "1";
}

export function getE2eFixtureUser(): AuthenticatedUser {
  return {
    email: "e2e@example.com",
    id: "e2e-user-1",
    image: null,
    issuer: "https://example.com",
    name: "E2E User",
    subject: "e2e-subject-1",
  };
}

export function listE2eLibraryWorks(): LibraryWorkSummary[] {
  return [
    {
      authors: ["N. K. Jemisin"],
      editionCount: 2,
      formatFamilies: [FormatFamily.AUDIOBOOK, FormatFamily.EBOOK],
      latestProgress: {
        percent: 0.62,
        progressKind: "AUDIO",
        source: "audible",
        updatedAt: "2025-01-09T12:00:00.000Z",
      },
      shelves: ["Favorites"],
      titleDisplay: "The Fifth Season",
      workId: "work-e2e-1",
    },
  ];
}

export function getE2eWorkProgressView(workId: string): WorkProgressView | null {
  if (workId !== "work-e2e-1") {
    return null;
  }

  return {
    collections: [
      {
        containsWork: true,
        id: "collection-e2e-1",
        itemCount: 1,
        kind: "MANUAL",
        name: "Favorites",
      },
      {
        containsWork: false,
        id: "collection-e2e-2",
        itemCount: 3,
        kind: "MANUAL",
        name: "Queued",
      },
    ],
    contributorGroups: [
      {
        names: ["N. K. Jemisin"],
        role: ContributorRole.AUTHOR,
      },
      {
        names: ["Robin Miles"],
        role: ContributorRole.NARRATOR,
      },
    ],
    currentSourceEditionId: "edition-e2e-2",
    description: "This is the way the world ends. For the last time.",
    editions: [
      {
        asin: null,
        contributors: [
          {
            name: "Robin Miles",
            role: ContributorRole.NARRATOR,
          },
        ],
        externalLinks: [],
        files: [
          {
            basename: "fifth-season.m4b",
            createdAt: "2025-01-01T00:00:00.000Z",
            extension: "m4b",
            id: "file-e2e-2",
            mediaKind: MediaKind.AUDIO,
            modifiedAt: "2025-01-03T00:00:00.000Z",
            relativePath: "audio/fifth-season.m4b",
            role: EditionFileRole.AUDIO_TRACK,
            sizeBytes: "10485760",
          },
        ],
        formatFamily: FormatFamily.AUDIOBOOK,
        id: "edition-e2e-2",
        isbn10: null,
        isbn13: null,
        publishedAt: null,
        publisher: "Hachette Audio",
      },
      {
        asin: "B00XSSYR50",
        contributors: [
          {
            name: "N. K. Jemisin",
            role: ContributorRole.AUTHOR,
          },
        ],
        externalLinks: [
          {
            editionId: "edition-e2e-1",
            externalId: "OL123",
            id: "external-link-e2e-1",
            lastSyncedAt: "2025-01-07T10:00:00.000Z",
            metadata: "{\n  \"source\": \"fixture\"\n}",
            provider: "openlibrary",
          },
        ],
        files: [
          {
            basename: "fifth-season.epub",
            createdAt: "2025-01-01T00:00:00.000Z",
            extension: "epub",
            id: "file-e2e-1",
            mediaKind: MediaKind.EPUB,
            modifiedAt: "2025-01-02T00:00:00.000Z",
            relativePath: "ebooks/fifth-season.epub",
            role: EditionFileRole.PRIMARY,
            sizeBytes: "2048",
          },
        ],
        formatFamily: FormatFamily.EBOOK,
        id: "edition-e2e-1",
        isbn10: "0316229296",
        isbn13: "9780316229292",
        publishedAt: "2015-08-04T00:00:00.000Z",
        publisher: "Orbit",
      },
    ],
    effectiveMode: ProgressTrackingMode.BY_WORK,
    formatFamilies: [FormatFamily.AUDIOBOOK, FormatFamily.EBOOK],
    globalMode: ProgressTrackingMode.BY_WORK,
    language: "en",
    overrideMode: ProgressTrackingMode.BY_EDITION,
    progressRows: [
      {
        editionId: "edition-e2e-2",
        formatFamily: FormatFamily.AUDIOBOOK,
        id: "progress-e2e-1",
        locator: {},
        percent: 0.62,
        progressKind: "AUDIO",
        source: "audible",
        updatedAt: "2025-01-09T12:00:00.000Z",
      },
      {
        editionId: "edition-e2e-1",
        formatFamily: FormatFamily.EBOOK,
        id: "progress-e2e-2",
        locator: { cfi: {} },
        percent: 0.2,
        progressKind: "EBOOK",
        source: "kobo",
        updatedAt: "2025-01-02T09:00:00.000Z",
      },
    ],
    series: {
      id: "series-e2e-1",
      name: "The Broken Earth",
    },
    sortTitle: "Fifth Season, The",
    summary: {
      percent: 0.62,
      progressKind: "AUDIO",
      source: "audible",
      updatedAt: "2025-01-09T12:00:00.000Z",
    },
    workId: "work-e2e-1",
    workTitle: "The Fifth Season",
  };
}
