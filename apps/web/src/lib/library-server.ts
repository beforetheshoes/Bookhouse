import {
  DuplicateReason,
  ProgressTrackingMode,
  ReviewStatus,
} from "@bookhouse/domain";
import { createServerFn } from "@tanstack/react-start";
import {
  addWorkToCollectionSchema,
  createCollectionSchema,
  createExternalLinkSchema,
  deleteCollectionSchema,
  deleteExternalLinkSchema,
  getCollectionDetailSchema,
  listLibraryWorksSchema,
  getWorkCollectionMembershipSchema,
  getWorkProgressViewSchema,
  listExternalLinksForWorkSchema,
  readingProgressLookupSchema,
  removeWorkFromCollectionSchema,
  renameCollectionSchema,
  updateExternalLinkSchema,
  updateUserProgressTrackingModeSchema,
  updateWorkProgressTrackingModeSchema,
  upsertReadingProgressSchema,
} from "./progress-validation";
import {
  getE2eWorkProgressView,
  isE2eFixtureMode,
  listE2eLibraryWorks,
} from "./e2e-fixtures";

type LibraryServiceModule = typeof import("./library-service");

async function loadLibraryDeps(): Promise<{
  db: import("./library-service").LibraryServiceDb;
  service: LibraryServiceModule;
}> {
  const [{ db }, service] = await Promise.all([
    import("@bookhouse/db"),
    import("./library-service"),
  ]);

  return {
    db: db as unknown as import("./library-service").LibraryServiceDb,
    service,
  };
}

export async function requireCurrentUserId(): Promise<string> {
  const { getCurrentUser } = await import("./auth-server");
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication required");
  }

  return user.id;
}

export async function listDuplicateCandidatesAction(data: {
  reason?: DuplicateReason | "ALL";
  status?: ReviewStatus | "ALL";
} | undefined) {
  const { db, service } = await loadLibraryDeps();
  return service.listDuplicateCandidates(db, data ?? {});
}

export async function listAudioLinksAction(data: {
  status?: ReviewStatus | "ALL";
} | undefined) {
  const { db, service } = await loadLibraryDeps();
  return service.listAudioLinks(db, data ?? {});
}

export async function listCollectionsAction() {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.listCollections(db, userId);
}

export async function listLibraryWorksAction(data: {
  filter?: "all" | "with-progress" | "without-progress";
  sort?: "title-asc" | "title-desc" | "recent-progress";
} | undefined) {
  if (isE2eFixtureMode()) {
    return listE2eLibraryWorks();
  }

  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.listLibraryWorks(db, userId, data ?? {});
}

export async function listExternalLinksForWorkAction(data: { workId: string }) {
  await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.listExternalLinksForWork(db, data.workId);
}

export async function getCollectionDetailAction(data: { collectionId: string }) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.getCollectionDetail(db, userId, data.collectionId);
}

export async function createCollectionAction(data: { name: string }) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.createCollection(db, userId, data.name);
}

export async function createExternalLinkAction(data: {
  editionId: string;
  externalId: string;
  lastSyncedAt: Date | null;
  metadata: Record<string, unknown> | null;
  provider: string;
}) {
  await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.createExternalLink(
    db,
    data.editionId,
    data.provider,
    data.externalId,
    data.metadata,
    data.lastSyncedAt,
  );
}

export async function renameCollectionAction(data: { collectionId: string; name: string }) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.renameCollection(db, userId, data.collectionId, data.name);
}

export async function deleteCollectionAction(data: { collectionId: string }) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  await service.deleteCollection(db, userId, data.collectionId);
}

export async function updateExternalLinkAction(data: {
  externalId: string;
  lastSyncedAt: Date | null;
  linkId: string;
  metadata: Record<string, unknown> | null;
  provider: string;
}) {
  await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.updateExternalLink(
    db,
    data.linkId,
    data.provider,
    data.externalId,
    data.metadata,
    data.lastSyncedAt,
  );
}

export async function addWorkToCollectionAction(data: { collectionId: string; workId: string }) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  await service.addWorkToCollection(db, userId, data.collectionId, data.workId);
}

export async function removeWorkFromCollectionAction(data: { collectionId: string; workId: string }) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  await service.removeWorkFromCollection(db, userId, data.collectionId, data.workId);
}

export async function deleteExternalLinkAction(data: { linkId: string }) {
  await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  await service.deleteExternalLink(db, data.linkId);
}

export async function getWorkCollectionMembershipAction(data: { workId: string }) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.getWorkCollectionMembership(db, userId, data.workId);
}

export async function getDuplicateCandidateDetailAction(data: { candidateId: string }) {
  const { db, service } = await loadLibraryDeps();
  return service.getDuplicateCandidateDetail(db, data.candidateId);
}

export async function getAudioLinkDetailAction(data: { linkId: string }) {
  const { db, service } = await loadLibraryDeps();
  return service.getAudioLinkDetail(db, data.linkId);
}

export async function updateDuplicateCandidateStatusAction(data: {
  candidateId: string;
  status: ReviewStatus;
}) {
  await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.updateDuplicateCandidateStatus(db, data.candidateId, data.status);
}

export async function updateAudioLinkStatusAction(data: {
  linkId: string;
  status: ReviewStatus;
}) {
  await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.updateAudioLinkStatus(db, data.linkId, data.status);
}

export async function mergeDuplicateCandidateAction(data: {
  candidateId: string;
  survivorSide: "left" | "right";
}) {
  await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.mergeDuplicateCandidate(db, data.candidateId, data.survivorSide);
}

export async function getUserProgressTrackingModeAction() {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.getUserProgressTrackingMode(db, userId);
}

export async function getReadingProgressAction(data: {
  editionId: string;
  progressKind: import("@bookhouse/domain").ProgressKind;
  source: string | null;
}) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.getReadingProgress(db, userId, data);
}

export async function upsertReadingProgressAction(data: {
  editionId: string;
  locator: Record<string, object>;
  percent: number | null;
  progressKind: import("@bookhouse/domain").ProgressKind;
  source: string | null;
}) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.upsertReadingProgress(db, userId, data);
}

export async function deleteReadingProgressAction(data: {
  editionId: string;
  progressKind: import("@bookhouse/domain").ProgressKind;
  source: string | null;
}) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  await service.deleteReadingProgress(db, userId, data);
}

export async function updateUserProgressTrackingModeAction(data: {
  progressTrackingMode: ProgressTrackingMode;
}) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.updateUserProgressTrackingMode(db, userId, data.progressTrackingMode);
}

export async function getWorkProgressViewAction(data: { workId: string }) {
  if (isE2eFixtureMode()) {
    return getE2eWorkProgressView(data.workId);
  }

  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.getWorkProgressView(db, userId, data.workId);
}

export async function updateWorkProgressTrackingModeAction(data: {
  progressTrackingMode: ProgressTrackingMode | null;
  workId: string;
}) {
  const userId = await requireCurrentUserId();
  const { db, service } = await loadLibraryDeps();
  return service.updateWorkProgressTrackingMode(db, userId, data.workId, data.progressTrackingMode);
}

export const validateListDuplicateCandidatesInput = (
  data: { reason?: DuplicateReason | "ALL"; status?: ReviewStatus | "ALL" } | undefined,
) => data;

export const validateListAudioLinksInput = (
  data: { status?: ReviewStatus | "ALL" } | undefined,
) => data;

export const validateListCollectionsInput = () => undefined;

export const validateListLibraryWorksInput = (data: {
  filter?: "all" | "with-progress" | "without-progress";
  sort?: "title-asc" | "title-desc" | "recent-progress";
} | undefined) => listLibraryWorksSchema.parse(data ?? {});

export const validateListExternalLinksForWorkInput = (data: { workId: string }) =>
  listExternalLinksForWorkSchema.parse(data);

export const validateGetCollectionDetailInput = (data: { collectionId: string }) =>
  getCollectionDetailSchema.parse(data);

export const validateCreateCollectionInput = (data: { name: string }) =>
  createCollectionSchema.parse(data);

export const validateCreateExternalLinkInput = (data: {
  editionId: string;
  externalId: string;
  lastSyncedAt: string | null;
  metadata: string;
  provider: string;
}): {
  editionId: string;
  externalId: string;
  lastSyncedAt: Date | null;
  metadata: Record<string, unknown> | null;
  provider: string;
} => createExternalLinkSchema.parse(data);

export const validateRenameCollectionInput = (data: { collectionId: string; name: string }) =>
  renameCollectionSchema.parse(data);

export const validateDeleteCollectionInput = (data: { collectionId: string }) =>
  deleteCollectionSchema.parse(data);

export const validateUpdateExternalLinkInput = (data: {
  externalId: string;
  lastSyncedAt: string | null;
  linkId: string;
  metadata: string;
  provider: string;
}): {
  externalId: string;
  lastSyncedAt: Date | null;
  linkId: string;
  metadata: Record<string, unknown> | null;
  provider: string;
} => updateExternalLinkSchema.parse(data);

export const validateAddWorkToCollectionInput = (data: { collectionId: string; workId: string }) =>
  addWorkToCollectionSchema.parse(data);

export const validateRemoveWorkFromCollectionInput = (data: { collectionId: string; workId: string }) =>
  removeWorkFromCollectionSchema.parse(data);

export const validateDeleteExternalLinkInput = (data: { linkId: string }) =>
  deleteExternalLinkSchema.parse(data);

export const validateGetWorkCollectionMembershipInput = (data: { workId: string }) =>
  getWorkCollectionMembershipSchema.parse(data);

export const validateGetDuplicateCandidateDetailInput = (data: { candidateId: string }) => data;

export const validateGetAudioLinkDetailInput = (data: { linkId: string }) => data;

export const validateUpdateDuplicateCandidateStatusInput = (
  data: { candidateId: string; status: ReviewStatus },
) => data;

export const validateUpdateAudioLinkStatusInput = (
  data: { linkId: string; status: ReviewStatus },
) => data;

export const validateMergeDuplicateCandidateInput = (
  data: { candidateId: string; survivorSide: "left" | "right" },
) => data;

export const validateUpdateUserProgressTrackingModeInput = (
  data: { progressTrackingMode: ProgressTrackingMode },
) => updateUserProgressTrackingModeSchema.parse(data);

export const validateGetReadingProgressInput = (data: {
  editionId: string;
  progressKind: import("@bookhouse/domain").ProgressKind;
  source: string | null;
}) => readingProgressLookupSchema.parse(data);

export const validateUpsertReadingProgressInput = (data: {
  editionId: string;
  locator: Record<string, object>;
  percent: number | null;
  progressKind: import("@bookhouse/domain").ProgressKind;
  source: string | null;
}) => upsertReadingProgressSchema.parse(data);

export const validateDeleteReadingProgressInput = (data: {
  editionId: string;
  progressKind: import("@bookhouse/domain").ProgressKind;
  source: string | null;
}) => readingProgressLookupSchema.parse(data);

export const validateGetWorkProgressViewInput = (data: { workId: string }) =>
  getWorkProgressViewSchema.parse(data);

export const validateUpdateWorkProgressTrackingModeInput = (
  data: { progressTrackingMode: ProgressTrackingMode | null; workId: string },
) => updateWorkProgressTrackingModeSchema.parse(data);

export const listDuplicateCandidatesServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateListDuplicateCandidatesInput)
  .handler(async ({ data }) => listDuplicateCandidatesAction(data));

export const listAudioLinksServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateListAudioLinksInput)
  .handler(async ({ data }) => listAudioLinksAction(data));

export const listCollectionsServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateListCollectionsInput)
  .handler(async () => listCollectionsAction());

export const listLibraryWorksServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateListLibraryWorksInput)
  .handler(async ({ data }) => listLibraryWorksAction(data));

export const listExternalLinksForWorkServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateListExternalLinksForWorkInput)
  .handler(async ({ data }) => listExternalLinksForWorkAction(data));

export const getCollectionDetailServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateGetCollectionDetailInput)
  .handler(async ({ data }) => getCollectionDetailAction(data));

export const createCollectionServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateCreateCollectionInput)
  .handler(async ({ data }) => createCollectionAction(data));

export const createExternalLinkServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateCreateExternalLinkInput)
  .handler(async ({ data }) => createExternalLinkAction(data));

export const renameCollectionServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateRenameCollectionInput)
  .handler(async ({ data }) => renameCollectionAction(data));

export const deleteCollectionServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateDeleteCollectionInput)
  .handler(async ({ data }) => deleteCollectionAction(data));

export const updateExternalLinkServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateExternalLinkInput)
  .handler(async ({ data }) => updateExternalLinkAction(data));

export const addWorkToCollectionServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateAddWorkToCollectionInput)
  .handler(async ({ data }) => addWorkToCollectionAction(data));

export const removeWorkFromCollectionServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateRemoveWorkFromCollectionInput)
  .handler(async ({ data }) => removeWorkFromCollectionAction(data));

export const deleteExternalLinkServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateDeleteExternalLinkInput)
  .handler(async ({ data }) => deleteExternalLinkAction(data));

export const getWorkCollectionMembershipServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateGetWorkCollectionMembershipInput)
  .handler(async ({ data }) => getWorkCollectionMembershipAction(data));

export const getDuplicateCandidateDetailServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateGetDuplicateCandidateDetailInput)
  .handler(async ({ data }) => getDuplicateCandidateDetailAction(data));

export const getAudioLinkDetailServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateGetAudioLinkDetailInput)
  .handler(async ({ data }) => getAudioLinkDetailAction(data));

export const updateDuplicateCandidateStatusServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateDuplicateCandidateStatusInput)
  .handler(async ({ data }) => updateDuplicateCandidateStatusAction(data));

export const updateAudioLinkStatusServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateAudioLinkStatusInput)
  .handler(async ({ data }) => updateAudioLinkStatusAction(data));

export const mergeDuplicateCandidateServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateMergeDuplicateCandidateInput)
  .handler(async ({ data }) => mergeDuplicateCandidateAction(data));

export const getUserProgressTrackingModeServerFn = createServerFn({ method: "GET" }).handler(
  async () => getUserProgressTrackingModeAction(),
);

export const getReadingProgressServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateGetReadingProgressInput)
  .handler(async ({ data }) => getReadingProgressAction(data));

export const upsertReadingProgressServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateUpsertReadingProgressInput)
  .handler(async ({ data }) => upsertReadingProgressAction(data));

export const deleteReadingProgressServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateDeleteReadingProgressInput)
  .handler(async ({ data }) => deleteReadingProgressAction(data));

export const updateUserProgressTrackingModeServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateUserProgressTrackingModeInput)
  .handler(async ({ data }) => updateUserProgressTrackingModeAction(data));

export const getWorkProgressViewServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateGetWorkProgressViewInput)
  .handler(async ({ data }) => getWorkProgressViewAction(data));

export const updateWorkProgressTrackingModeServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateWorkProgressTrackingModeInput)
  .handler(async ({ data }) => updateWorkProgressTrackingModeAction(data));
