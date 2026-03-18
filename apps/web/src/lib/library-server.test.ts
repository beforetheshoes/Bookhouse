import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressKind, ProgressTrackingMode, ReviewStatus } from "@bookhouse/domain";

const deleteReadingProgressMock = vi.fn();
const addWorkToCollectionMock = vi.fn();
const createCollectionMock = vi.fn();
const createExternalLinkMock = vi.fn();
const deleteCollectionMock = vi.fn();
const deleteExternalLinkMock = vi.fn();
const getCollectionDetailMock = vi.fn();
const getReadingProgressMock = vi.fn();
const getAudioLinkDetailMock = vi.fn();
const getCurrentUserMock = vi.fn();
const getDuplicateCandidateDetailMock = vi.fn();
const listExternalLinksForWorkMock = vi.fn();
const getWorkCollectionMembershipMock = vi.fn();
const getUserProgressTrackingModeMock = vi.fn();
const getWorkProgressViewMock = vi.fn();
const listCollectionsMock = vi.fn();
const listAudioLinksMock = vi.fn();
const listDuplicateCandidatesMock = vi.fn();
const mergeDuplicateCandidateMock = vi.fn();
const removeWorkFromCollectionMock = vi.fn();
const renameCollectionMock = vi.fn();
const upsertReadingProgressMock = vi.fn();
const updateExternalLinkMock = vi.fn();
const updateAudioLinkStatusMock = vi.fn();
const updateDuplicateCandidateStatusMock = vi.fn();
const updateUserProgressTrackingModeMock = vi.fn();
const updateWorkProgressTrackingModeMock = vi.fn();

vi.mock("./auth-server", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("./library-service", () => ({
  addWorkToCollection: addWorkToCollectionMock,
  createCollection: createCollectionMock,
  createExternalLink: createExternalLinkMock,
  deleteReadingProgress: deleteReadingProgressMock,
  deleteCollection: deleteCollectionMock,
  deleteExternalLink: deleteExternalLinkMock,
  getCollectionDetail: getCollectionDetailMock,
  getReadingProgress: getReadingProgressMock,
  getAudioLinkDetail: getAudioLinkDetailMock,
  getDuplicateCandidateDetail: getDuplicateCandidateDetailMock,
  getWorkCollectionMembership: getWorkCollectionMembershipMock,
  getUserProgressTrackingMode: getUserProgressTrackingModeMock,
  getWorkProgressView: getWorkProgressViewMock,
  listExternalLinksForWork: listExternalLinksForWorkMock,
  listCollections: listCollectionsMock,
  listAudioLinks: listAudioLinksMock,
  listDuplicateCandidates: listDuplicateCandidatesMock,
  mergeDuplicateCandidate: mergeDuplicateCandidateMock,
  removeWorkFromCollection: removeWorkFromCollectionMock,
  renameCollection: renameCollectionMock,
  upsertReadingProgress: upsertReadingProgressMock,
  updateExternalLink: updateExternalLinkMock,
  updateAudioLinkStatus: updateAudioLinkStatusMock,
  updateDuplicateCandidateStatus: updateDuplicateCandidateStatusMock,
  updateUserProgressTrackingMode: updateUserProgressTrackingModeMock,
  updateWorkProgressTrackingMode: updateWorkProgressTrackingModeMock,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator() {
      return this;
    },
    handler(fn: (...args: unknown[]) => unknown) {
      return fn;
    },
  }),
}));

beforeEach(() => {
  deleteReadingProgressMock.mockReset();
  addWorkToCollectionMock.mockReset();
  createCollectionMock.mockReset();
  createExternalLinkMock.mockReset();
  deleteCollectionMock.mockReset();
  deleteExternalLinkMock.mockReset();
  getCollectionDetailMock.mockReset();
  getReadingProgressMock.mockReset();
  getAudioLinkDetailMock.mockReset();
  getCurrentUserMock.mockReset();
  getDuplicateCandidateDetailMock.mockReset();
  listExternalLinksForWorkMock.mockReset();
  getWorkCollectionMembershipMock.mockReset();
  getUserProgressTrackingModeMock.mockReset();
  getWorkProgressViewMock.mockReset();
  listCollectionsMock.mockReset();
  listAudioLinksMock.mockReset();
  listDuplicateCandidatesMock.mockReset();
  mergeDuplicateCandidateMock.mockReset();
  removeWorkFromCollectionMock.mockReset();
  renameCollectionMock.mockReset();
  upsertReadingProgressMock.mockReset();
  updateExternalLinkMock.mockReset();
  updateAudioLinkStatusMock.mockReset();
  updateDuplicateCandidateStatusMock.mockReset();
  updateUserProgressTrackingModeMock.mockReset();
  updateWorkProgressTrackingModeMock.mockReset();
});

describe("library server functions", () => {
  it("lists and loads duplicate candidates", async () => {
    const server = await import("./library-server");
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    listCollectionsMock.mockResolvedValueOnce([{ id: "collection-1" }]);
    listExternalLinksForWorkMock.mockResolvedValueOnce([{ id: "external-link-1" }]);
    getCollectionDetailMock.mockResolvedValueOnce({ id: "collection-1" });
    listAudioLinksMock.mockResolvedValueOnce([{ id: "audio-link-1" }]);
    getAudioLinkDetailMock.mockResolvedValueOnce({ id: "audio-link-1" });
    listDuplicateCandidatesMock.mockResolvedValueOnce([{ id: "candidate-1" }]);
    getDuplicateCandidateDetailMock.mockResolvedValueOnce({ id: "candidate-1" });
    getWorkCollectionMembershipMock.mockResolvedValueOnce([{ id: "collection-1", containsWork: true }]);

    await expect(server.listCollectionsServerFn()).resolves.toEqual([{ id: "collection-1" }]);
    await expect(
      server.listExternalLinksForWorkServerFn({ data: { workId: "work-1" } }),
    ).resolves.toEqual([{ id: "external-link-1" }]);
    await expect(
      server.getCollectionDetailServerFn({ data: { collectionId: "collection-1" } }),
    ).resolves.toEqual({ id: "collection-1" });
    await expect(
      server.listAudioLinksServerFn({ data: { status: ReviewStatus.PENDING } }),
    ).resolves.toEqual([{ id: "audio-link-1" }]);
    await expect(
      server.getAudioLinkDetailServerFn({ data: { linkId: "audio-link-1" } }),
    ).resolves.toEqual({ id: "audio-link-1" });
    await expect(
      server.listDuplicateCandidatesServerFn({ data: { status: ReviewStatus.PENDING } }),
    ).resolves.toEqual([{ id: "candidate-1" }]);
    await expect(
      server.getDuplicateCandidateDetailServerFn({ data: { candidateId: "candidate-1" } }),
    ).resolves.toEqual({ id: "candidate-1" });
    await expect(
      server.getWorkCollectionMembershipServerFn({ data: { workId: "work-1" } }),
    ).resolves.toEqual([{ id: "collection-1", containsWork: true }]);
  });

  it("requires authentication for mutations", async () => {
    const server = await import("./library-server");
    getCurrentUserMock.mockResolvedValue(null);

    await expect(
      server.createCollectionServerFn({
        data: {
          name: "Favorites",
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.createExternalLinkServerFn({
        data: {
          editionId: "edition-1",
          externalId: "OL1",
          lastSyncedAt: null,
          metadata: "{}",
          provider: "openlibrary",
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.renameCollectionServerFn({
        data: {
          collectionId: "collection-1",
          name: "Favorites",
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.deleteCollectionServerFn({
        data: {
          collectionId: "collection-1",
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.updateExternalLinkServerFn({
        data: {
          externalId: "OL1",
          lastSyncedAt: null,
          linkId: "external-link-1",
          metadata: "{}",
          provider: "openlibrary",
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.addWorkToCollectionServerFn({
        data: {
          collectionId: "collection-1",
          workId: "work-1",
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.removeWorkFromCollectionServerFn({
        data: {
          collectionId: "collection-1",
          workId: "work-1",
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.deleteExternalLinkServerFn({
        data: {
          linkId: "external-link-1",
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.updateAudioLinkStatusServerFn({
        data: {
          linkId: "audio-link-1",
          status: ReviewStatus.CONFIRMED,
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.updateDuplicateCandidateStatusServerFn({
        data: {
          candidateId: "candidate-1",
          status: ReviewStatus.CONFIRMED,
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.mergeDuplicateCandidateServerFn({
        data: {
          candidateId: "candidate-1",
          survivorSide: "left",
        },
      }),
    ).rejects.toThrow("Authentication required");
  });

  it("updates duplicate status and progress preferences for an authenticated user", async () => {
    const server = await import("./library-server");
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    createCollectionMock.mockResolvedValueOnce({ id: "collection-1", name: "Favorites" });
    createExternalLinkMock.mockResolvedValueOnce({ id: "external-link-1", provider: "openlibrary" });
    renameCollectionMock.mockResolvedValueOnce({ id: "collection-1", name: "Favorites Updated" });
    deleteCollectionMock.mockResolvedValueOnce(undefined);
    updateExternalLinkMock.mockResolvedValueOnce({ id: "external-link-1", provider: "goodreads" });
    addWorkToCollectionMock.mockResolvedValueOnce(undefined);
    removeWorkFromCollectionMock.mockResolvedValueOnce(undefined);
    deleteExternalLinkMock.mockResolvedValueOnce(undefined);
    updateAudioLinkStatusMock.mockResolvedValueOnce({ reviewStatus: ReviewStatus.CONFIRMED });
    updateDuplicateCandidateStatusMock.mockResolvedValueOnce({ status: ReviewStatus.IGNORED });
    mergeDuplicateCandidateMock.mockResolvedValueOnce({ status: ReviewStatus.MERGED });
    getReadingProgressMock.mockResolvedValueOnce({ id: "progress-1" });
    upsertReadingProgressMock.mockResolvedValueOnce({ id: "progress-1", percent: 0.4 });
    deleteReadingProgressMock.mockResolvedValueOnce(undefined);
    getUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_EDITION);
    updateUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_WORK);
    getWorkProgressViewMock.mockResolvedValueOnce({ workId: "work-1" });
    updateWorkProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_WORK);

    await expect(
      server.createCollectionServerFn({
        data: {
          name: "Favorites",
        },
      }),
    ).resolves.toEqual({ id: "collection-1", name: "Favorites" });
    await expect(
      server.createExternalLinkServerFn({
        data: {
          editionId: "edition-1",
          externalId: "OL1",
          lastSyncedAt: "2025-01-01T10:00",
          metadata: "{\"source\":\"manual\"}",
          provider: "openlibrary",
        },
      }),
    ).resolves.toEqual({ id: "external-link-1", provider: "openlibrary" });
    await expect(
      server.renameCollectionServerFn({
        data: {
          collectionId: "collection-1",
          name: "Favorites Updated",
        },
      }),
    ).resolves.toEqual({ id: "collection-1", name: "Favorites Updated" });
    await expect(
      server.deleteCollectionServerFn({
        data: {
          collectionId: "collection-1",
        },
      }),
    ).resolves.toBeUndefined();
    await expect(
      server.updateExternalLinkServerFn({
        data: {
          externalId: "GR1",
          lastSyncedAt: null,
          linkId: "external-link-1",
          metadata: "{\"shelf\":\"favorites\"}",
          provider: "goodreads",
        },
      }),
    ).resolves.toEqual({ id: "external-link-1", provider: "goodreads" });
    await expect(
      server.addWorkToCollectionServerFn({
        data: {
          collectionId: "collection-1",
          workId: "work-1",
        },
      }),
    ).resolves.toBeUndefined();
    await expect(
      server.removeWorkFromCollectionServerFn({
        data: {
          collectionId: "collection-1",
          workId: "work-1",
        },
      }),
    ).resolves.toBeUndefined();
    await expect(
      server.deleteExternalLinkServerFn({
        data: {
          linkId: "external-link-1",
        },
      }),
    ).resolves.toBeUndefined();

    await expect(
      server.updateAudioLinkStatusServerFn({
        data: {
          linkId: "audio-link-1",
          status: ReviewStatus.CONFIRMED,
        },
      }),
    ).resolves.toEqual({ reviewStatus: ReviewStatus.CONFIRMED });
    await expect(
      server.updateDuplicateCandidateStatusServerFn({
        data: {
          candidateId: "candidate-1",
          status: ReviewStatus.IGNORED,
        },
      }),
    ).resolves.toEqual({ status: ReviewStatus.IGNORED });
    await expect(
      server.mergeDuplicateCandidateServerFn({
        data: {
          candidateId: "candidate-1",
          survivorSide: "right",
        },
      }),
    ).resolves.toEqual({ status: ReviewStatus.MERGED });
    await expect(server.getUserProgressTrackingModeServerFn()).resolves.toBe(
      ProgressTrackingMode.BY_EDITION,
    );
    await expect(
      server.getReadingProgressServerFn({
        data: {
          editionId: "edition-1",
          progressKind: ProgressKind.EBOOK,
          source: "kobo",
        },
      }),
    ).resolves.toEqual({ id: "progress-1" });
    await expect(
      server.upsertReadingProgressServerFn({
        data: {
          editionId: "edition-1",
          locator: { cfi: {} },
          percent: 0.4,
          progressKind: ProgressKind.EBOOK,
          source: "kobo",
        },
      }),
    ).resolves.toEqual({ id: "progress-1", percent: 0.4 });
    await expect(
      server.deleteReadingProgressServerFn({
        data: {
          editionId: "edition-1",
          progressKind: ProgressKind.EBOOK,
          source: "kobo",
        },
      }),
    ).resolves.toBeUndefined();
    await expect(
      server.updateUserProgressTrackingModeServerFn({
        data: {
          progressTrackingMode: ProgressTrackingMode.BY_WORK,
        },
      }),
    ).resolves.toBe(ProgressTrackingMode.BY_WORK);
    await expect(
      server.getWorkProgressViewServerFn({
        data: {
          workId: "work-1",
        },
      }),
    ).resolves.toEqual({ workId: "work-1" });
    await expect(
      server.updateWorkProgressTrackingModeServerFn({
        data: {
          progressTrackingMode: ProgressTrackingMode.BY_WORK,
          workId: "work-1",
        },
      }),
    ).resolves.toBe(ProgressTrackingMode.BY_WORK);
  });

  it("requires authentication for progress reads and writes", async () => {
    const server = await import("./library-server");
    getCurrentUserMock.mockResolvedValue(null);

    await expect(server.getUserProgressTrackingModeServerFn()).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      server.getReadingProgressServerFn({
        data: {
          editionId: "edition-1",
          progressKind: ProgressKind.EBOOK,
          source: null,
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.upsertReadingProgressServerFn({
        data: {
          editionId: "edition-1",
          locator: { cfi: {} },
          percent: 0.3,
          progressKind: ProgressKind.EBOOK,
          source: null,
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.deleteReadingProgressServerFn({
        data: {
          editionId: "edition-1",
          progressKind: ProgressKind.EBOOK,
          source: null,
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.updateUserProgressTrackingModeServerFn({
        data: {
          progressTrackingMode: ProgressTrackingMode.BY_EDITION,
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.getWorkProgressViewServerFn({
        data: {
          workId: "work-1",
        },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      server.updateWorkProgressTrackingModeServerFn({
        data: {
          progressTrackingMode: null,
          workId: "work-1",
        },
      }),
    ).rejects.toThrow("Authentication required");
  });

  it("covers the direct server actions", async () => {
    const server = await import("./library-server");
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    listAudioLinksMock.mockResolvedValueOnce([{ id: "audio-link-9" }]);
    getAudioLinkDetailMock.mockResolvedValueOnce({ id: "audio-link-9" });
    updateAudioLinkStatusMock.mockResolvedValueOnce({ reviewStatus: ReviewStatus.IGNORED });
    listDuplicateCandidatesMock.mockResolvedValueOnce([{ id: "candidate-9" }]);
    getDuplicateCandidateDetailMock.mockResolvedValueOnce({ id: "candidate-9" });
    updateDuplicateCandidateStatusMock.mockResolvedValueOnce({ status: ReviewStatus.CONFIRMED });
    mergeDuplicateCandidateMock.mockResolvedValueOnce({ status: ReviewStatus.MERGED });
    getReadingProgressMock.mockResolvedValueOnce({ id: "progress-9" });
    upsertReadingProgressMock.mockResolvedValueOnce({ id: "progress-9", percent: 0.9 });
    deleteReadingProgressMock.mockResolvedValueOnce(undefined);
    getUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_WORK);
    updateUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_EDITION);
    getWorkProgressViewMock.mockResolvedValueOnce({ workId: "work-9" });
    updateWorkProgressTrackingModeMock.mockResolvedValueOnce(null);

    await expect(server.listAudioLinksAction(undefined)).resolves.toEqual([{ id: "audio-link-9" }]);
    await expect(
      server.getAudioLinkDetailAction({ linkId: "audio-link-9" }),
    ).resolves.toEqual({ id: "audio-link-9" });
    await expect(
      server.updateAudioLinkStatusAction({
        linkId: "audio-link-9",
        status: ReviewStatus.IGNORED,
      }),
    ).resolves.toEqual({ reviewStatus: ReviewStatus.IGNORED });
    await expect(server.listDuplicateCandidatesAction(undefined)).resolves.toEqual([{ id: "candidate-9" }]);
    await expect(
      server.getDuplicateCandidateDetailAction({ candidateId: "candidate-9" }),
    ).resolves.toEqual({ id: "candidate-9" });
    await expect(
      server.updateDuplicateCandidateStatusAction({
        candidateId: "candidate-9",
        status: ReviewStatus.CONFIRMED,
      }),
    ).resolves.toEqual({ status: ReviewStatus.CONFIRMED });
    await expect(
      server.mergeDuplicateCandidateAction({
        candidateId: "candidate-9",
        survivorSide: "left",
      }),
    ).resolves.toEqual({ status: ReviewStatus.MERGED });
    await expect(
      server.getReadingProgressAction({
        editionId: "edition-9",
        progressKind: ProgressKind.EBOOK,
        source: null,
      }),
    ).resolves.toEqual({ id: "progress-9" });
    await expect(
      server.upsertReadingProgressAction({
        editionId: "edition-9",
        locator: { cfi: {} },
        percent: 0.9,
        progressKind: ProgressKind.EBOOK,
        source: null,
      }),
    ).resolves.toEqual({ id: "progress-9", percent: 0.9 });
    await expect(
      server.deleteReadingProgressAction({
        editionId: "edition-9",
        progressKind: ProgressKind.EBOOK,
        source: null,
      }),
    ).resolves.toBeUndefined();
    createCollectionMock.mockResolvedValueOnce({ id: "collection-9" });
    createExternalLinkMock.mockResolvedValueOnce({ id: "external-link-9", metadata: "" });
    renameCollectionMock.mockResolvedValueOnce({ id: "collection-9", name: "Renamed" });
    deleteCollectionMock.mockResolvedValueOnce(undefined);
    updateExternalLinkMock.mockResolvedValueOnce({ id: "external-link-9", metadata: "", provider: "goodreads" });
    addWorkToCollectionMock.mockResolvedValueOnce(undefined);
    removeWorkFromCollectionMock.mockResolvedValueOnce(undefined);
    deleteExternalLinkMock.mockResolvedValueOnce(undefined);
    listCollectionsMock.mockResolvedValueOnce([{ id: "collection-9" }]);
    listExternalLinksForWorkMock.mockResolvedValueOnce([{ id: "external-link-9" }]);
    getCollectionDetailMock.mockResolvedValueOnce({ id: "collection-9" });
    getWorkCollectionMembershipMock.mockResolvedValueOnce([{ id: "collection-9", containsWork: true }]);
    await expect(server.listCollectionsAction()).resolves.toEqual([{ id: "collection-9" }]);
    await expect(
      server.listExternalLinksForWorkAction({ workId: "work-9" }),
    ).resolves.toEqual([{ id: "external-link-9" }]);
    await expect(server.getCollectionDetailAction({ collectionId: "collection-9" })).resolves.toEqual({ id: "collection-9" });
    await expect(server.createCollectionAction({ name: "Favorites" })).resolves.toEqual({ id: "collection-9" });
    await expect(
      server.createExternalLinkAction({
        editionId: "edition-9",
        externalId: "OL9",
        lastSyncedAt: null,
        metadata: null,
        provider: "openlibrary",
      }),
    ).resolves.toEqual({ id: "external-link-9", metadata: "" });
    await expect(
      server.renameCollectionAction({ collectionId: "collection-9", name: "Renamed" }),
    ).resolves.toEqual({ id: "collection-9", name: "Renamed" });
    await expect(server.deleteCollectionAction({ collectionId: "collection-9" })).resolves.toBeUndefined();
    await expect(
      server.updateExternalLinkAction({
        externalId: "GR9",
        lastSyncedAt: null,
        linkId: "external-link-9",
        metadata: null,
        provider: "goodreads",
      }),
    ).resolves.toEqual({ id: "external-link-9", metadata: "", provider: "goodreads" });
    await expect(
      server.addWorkToCollectionAction({ collectionId: "collection-9", workId: "work-9" }),
    ).resolves.toBeUndefined();
    await expect(
      server.removeWorkFromCollectionAction({ collectionId: "collection-9", workId: "work-9" }),
    ).resolves.toBeUndefined();
    await expect(
      server.deleteExternalLinkAction({ linkId: "external-link-9" }),
    ).resolves.toBeUndefined();
    await expect(
      server.getWorkCollectionMembershipAction({ workId: "work-9" }),
    ).resolves.toEqual([{ id: "collection-9", containsWork: true }]);
    await expect(server.getUserProgressTrackingModeAction()).resolves.toBe(ProgressTrackingMode.BY_WORK);
    await expect(
      server.updateUserProgressTrackingModeAction({
        progressTrackingMode: ProgressTrackingMode.BY_EDITION,
      }),
    ).resolves.toBe(ProgressTrackingMode.BY_EDITION);
    await expect(
      server.getWorkProgressViewAction({
        workId: "work-9",
      }),
    ).resolves.toEqual({ workId: "work-9" });
    await expect(
      server.updateWorkProgressTrackingModeAction({
        progressTrackingMode: null,
        workId: "work-9",
      }),
    ).resolves.toBeNull();
  });

  it("returns validator inputs unchanged", async () => {
    const server = await import("./library-server");

    expect(server.validateListCollectionsInput()).toBeUndefined();
    expect(server.validateListExternalLinksForWorkInput({ workId: "work-1" })).toEqual({
      workId: "work-1",
    });
    expect(server.validateGetCollectionDetailInput({ collectionId: "collection-1" })).toEqual({
      collectionId: "collection-1",
    });
    expect(server.validateCreateCollectionInput({ name: "Favorites" })).toEqual({
      name: "Favorites",
    });
    expect(
      server.validateCreateExternalLinkInput({
        editionId: "edition-1",
        externalId: "OL1",
        lastSyncedAt: "2025-01-01T10:00",
        metadata: "{\"source\":\"manual\"}",
        provider: "openlibrary",
      }),
    ).toEqual({
      editionId: "edition-1",
      externalId: "OL1",
      lastSyncedAt: new Date("2025-01-01T10:00"),
      metadata: { source: "manual" },
      provider: "openlibrary",
    });
    expect(
      server.validateCreateExternalLinkInput({
        editionId: "edition-1",
        externalId: "OL-empty",
        lastSyncedAt: null,
        metadata: "",
        provider: "openlibrary",
      }),
    ).toEqual({
      editionId: "edition-1",
      externalId: "OL-empty",
      lastSyncedAt: null,
      metadata: null,
      provider: "openlibrary",
    });
    expect(
      server.validateRenameCollectionInput({ collectionId: "collection-1", name: "Favorites" }),
    ).toEqual({
      collectionId: "collection-1",
      name: "Favorites",
    });
    expect(server.validateDeleteCollectionInput({ collectionId: "collection-1" })).toEqual({
      collectionId: "collection-1",
    });
    expect(
      server.validateUpdateExternalLinkInput({
        externalId: "OL2",
        lastSyncedAt: null,
        linkId: "external-link-1",
        metadata: "{\"shelf\":\"favorites\"}",
        provider: "openlibrary",
      }),
    ).toEqual({
      externalId: "OL2",
      lastSyncedAt: null,
      linkId: "external-link-1",
      metadata: { shelf: "favorites" },
      provider: "openlibrary",
    });
    expect(
      server.validateAddWorkToCollectionInput({ collectionId: "collection-1", workId: "work-1" }),
    ).toEqual({
      collectionId: "collection-1",
      workId: "work-1",
    });
    expect(
      server.validateRemoveWorkFromCollectionInput({ collectionId: "collection-1", workId: "work-1" }),
    ).toEqual({
      collectionId: "collection-1",
      workId: "work-1",
    });
    expect(server.validateGetWorkCollectionMembershipInput({ workId: "work-1" })).toEqual({
      workId: "work-1",
    });
    expect(server.validateDeleteExternalLinkInput({ linkId: "external-link-1" })).toEqual({
      linkId: "external-link-1",
    });
    expect(
      server.validateListAudioLinksInput({ status: ReviewStatus.PENDING }),
    ).toEqual({ status: ReviewStatus.PENDING });
    expect(
      server.validateListDuplicateCandidatesInput({ status: ReviewStatus.PENDING }),
    ).toEqual({ status: ReviewStatus.PENDING });
    expect(
      server.validateGetAudioLinkDetailInput({ linkId: "audio-link-1" }),
    ).toEqual({ linkId: "audio-link-1" });
    expect(
      server.validateGetDuplicateCandidateDetailInput({ candidateId: "candidate-1" }),
    ).toEqual({ candidateId: "candidate-1" });
    expect(
      server.validateUpdateAudioLinkStatusInput({
        linkId: "audio-link-1",
        status: ReviewStatus.CONFIRMED,
      }),
    ).toEqual({
      linkId: "audio-link-1",
      status: ReviewStatus.CONFIRMED,
    });
    expect(
      server.validateUpdateDuplicateCandidateStatusInput({
        candidateId: "candidate-1",
        status: ReviewStatus.CONFIRMED,
      }),
    ).toEqual({
      candidateId: "candidate-1",
      status: ReviewStatus.CONFIRMED,
    });
    expect(
      server.validateMergeDuplicateCandidateInput({
        candidateId: "candidate-1",
        survivorSide: "left",
      }),
    ).toEqual({
      candidateId: "candidate-1",
      survivorSide: "left",
    });
    expect(
      server.validateGetReadingProgressInput({
        editionId: "edition-1",
        progressKind: ProgressKind.EBOOK,
        source: null,
      }),
    ).toEqual({
      editionId: "edition-1",
      progressKind: ProgressKind.EBOOK,
      source: null,
    });
    expect(
      server.validateUpsertReadingProgressInput({
        editionId: "edition-1",
        locator: { cfi: {} },
        percent: 0.3,
        progressKind: ProgressKind.EBOOK,
        source: null,
      }),
    ).toEqual({
      editionId: "edition-1",
      locator: { cfi: {} },
      percent: 0.3,
      progressKind: ProgressKind.EBOOK,
      source: null,
    });
    expect(
      server.validateDeleteReadingProgressInput({
        editionId: "edition-1",
        progressKind: ProgressKind.EBOOK,
        source: null,
      }),
    ).toEqual({
      editionId: "edition-1",
      progressKind: ProgressKind.EBOOK,
      source: null,
    });
    expect(
      server.validateUpdateUserProgressTrackingModeInput({
        progressTrackingMode: ProgressTrackingMode.BY_WORK,
      }),
    ).toEqual({
      progressTrackingMode: ProgressTrackingMode.BY_WORK,
    });
    expect(
      server.validateGetWorkProgressViewInput({ workId: "work-1" }),
    ).toEqual({ workId: "work-1" });
    expect(
      server.validateUpdateWorkProgressTrackingModeInput({
        progressTrackingMode: null,
        workId: "work-1",
      }),
    ).toEqual({
      progressTrackingMode: null,
      workId: "work-1",
    });
  });

  it("rejects malformed progress validator payloads", async () => {
    const server = await import("./library-server");

    expect(() => server.validateCreateCollectionInput({ name: "   " })).toThrow();
    expect(() => server.validateCreateExternalLinkInput({
      editionId: "edition-1",
      externalId: "OL1",
      lastSyncedAt: "bad-date",
      metadata: "{}",
      provider: "openlibrary",
    })).toThrow();
    expect(() => server.validateCreateExternalLinkInput({
      editionId: "edition-1",
      externalId: "OL-array",
      lastSyncedAt: null,
      metadata: "[]",
      provider: "openlibrary",
    })).toThrow();
    expect(() => server.validateUpdateExternalLinkInput({
      externalId: "OL1",
      lastSyncedAt: null,
      linkId: "",
      metadata: "not json",
      provider: "openlibrary",
    })).toThrow();
    expect(() => server.validateRenameCollectionInput({ collectionId: "", name: "Favorites" })).toThrow();
    expect(() => server.validateAddWorkToCollectionInput({ collectionId: "collection-1", workId: "" })).toThrow();
    expect(() => server.validateGetReadingProgressInput({
      editionId: "",
      progressKind: ProgressKind.EBOOK,
      source: null,
    })).toThrow();
    expect(() => server.validateUpsertReadingProgressInput({
      editionId: "edition-1",
      locator: { cfi: "bad" as never },
      percent: 2,
      progressKind: ProgressKind.EBOOK,
      source: null,
    })).toThrow();
    expect(() => server.validateUpdateWorkProgressTrackingModeInput({
      progressTrackingMode: "BAD_MODE" as never,
      workId: "work-1",
    })).toThrow();
  });
});
