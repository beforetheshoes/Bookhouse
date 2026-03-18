import { db } from "@bookhouse/db";
import {
  DuplicateReason,
  ProgressTrackingMode,
  ReviewStatus,
} from "@bookhouse/domain";
import { createServerFn } from "@tanstack/react-start";
import { getCurrentUser } from "./auth-server";
import {
  getAudioLinkDetail,
  getDuplicateCandidateDetail,
  getUserProgressTrackingMode,
  getWorkProgressView,
  listAudioLinks,
  listDuplicateCandidates,
  mergeDuplicateCandidate,
  updateAudioLinkStatus,
  updateDuplicateCandidateStatus,
  updateUserProgressTrackingMode,
  updateWorkProgressTrackingMode,
} from "./library-service";

const libraryDb = db as unknown as import("./library-service").LibraryServiceDb;

export async function requireCurrentUserId(): Promise<string> {
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
  return listDuplicateCandidates(libraryDb, data ?? {});
}

export async function listAudioLinksAction(data: {
  status?: ReviewStatus | "ALL";
} | undefined) {
  return listAudioLinks(libraryDb, data ?? {});
}

export async function getDuplicateCandidateDetailAction(data: { candidateId: string }) {
  return getDuplicateCandidateDetail(libraryDb, data.candidateId);
}

export async function getAudioLinkDetailAction(data: { linkId: string }) {
  return getAudioLinkDetail(libraryDb, data.linkId);
}

export async function updateDuplicateCandidateStatusAction(data: {
  candidateId: string;
  status: ReviewStatus;
}) {
  await requireCurrentUserId();
  return updateDuplicateCandidateStatus(libraryDb, data.candidateId, data.status);
}

export async function updateAudioLinkStatusAction(data: {
  linkId: string;
  status: ReviewStatus;
}) {
  await requireCurrentUserId();
  return updateAudioLinkStatus(libraryDb, data.linkId, data.status);
}

export async function mergeDuplicateCandidateAction(data: {
  candidateId: string;
  survivorSide: "left" | "right";
}) {
  await requireCurrentUserId();
  return mergeDuplicateCandidate(libraryDb, data.candidateId, data.survivorSide);
}

export async function getUserProgressTrackingModeAction() {
  const userId = await requireCurrentUserId();
  return getUserProgressTrackingMode(libraryDb, userId);
}

export async function updateUserProgressTrackingModeAction(data: {
  progressTrackingMode: ProgressTrackingMode;
}) {
  const userId = await requireCurrentUserId();
  return updateUserProgressTrackingMode(libraryDb, userId, data.progressTrackingMode);
}

export async function getWorkProgressViewAction(data: { workId: string }) {
  const userId = await requireCurrentUserId();
  return getWorkProgressView(libraryDb, userId, data.workId);
}

export async function updateWorkProgressTrackingModeAction(data: {
  progressTrackingMode: ProgressTrackingMode | null;
  workId: string;
}) {
  const userId = await requireCurrentUserId();
  return updateWorkProgressTrackingMode(libraryDb, userId, data.workId, data.progressTrackingMode);
}

export const validateListDuplicateCandidatesInput = (
  data: { reason?: DuplicateReason | "ALL"; status?: ReviewStatus | "ALL" } | undefined,
) => data;

export const validateListAudioLinksInput = (
  data: { status?: ReviewStatus | "ALL" } | undefined,
) => data;

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
) => data;

export const validateGetWorkProgressViewInput = (data: { workId: string }) => data;

export const validateUpdateWorkProgressTrackingModeInput = (
  data: { progressTrackingMode: ProgressTrackingMode | null; workId: string },
) => data;

export const listDuplicateCandidatesServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateListDuplicateCandidatesInput)
  .handler(async ({ data }) => listDuplicateCandidatesAction(data));

export const listAudioLinksServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateListAudioLinksInput)
  .handler(async ({ data }) => listAudioLinksAction(data));

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

export const updateUserProgressTrackingModeServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateUserProgressTrackingModeInput)
  .handler(async ({ data }) => updateUserProgressTrackingModeAction(data));

export const getWorkProgressViewServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateGetWorkProgressViewInput)
  .handler(async ({ data }) => getWorkProgressViewAction(data));

export const updateWorkProgressTrackingModeServerFn = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateWorkProgressTrackingModeInput)
  .handler(async ({ data }) => updateWorkProgressTrackingModeAction(data));
