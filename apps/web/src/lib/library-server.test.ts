import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressTrackingMode, ReviewStatus } from "@bookhouse/domain";

const getCurrentUserMock = vi.fn();
const getDuplicateCandidateDetailMock = vi.fn();
const getUserProgressTrackingModeMock = vi.fn();
const getWorkProgressViewMock = vi.fn();
const listDuplicateCandidatesMock = vi.fn();
const mergeDuplicateCandidateMock = vi.fn();
const updateDuplicateCandidateStatusMock = vi.fn();
const updateUserProgressTrackingModeMock = vi.fn();
const updateWorkProgressTrackingModeMock = vi.fn();

vi.mock("./auth-server", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("./library-service", () => ({
  getDuplicateCandidateDetail: getDuplicateCandidateDetailMock,
  getUserProgressTrackingMode: getUserProgressTrackingModeMock,
  getWorkProgressView: getWorkProgressViewMock,
  listDuplicateCandidates: listDuplicateCandidatesMock,
  mergeDuplicateCandidate: mergeDuplicateCandidateMock,
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
  getCurrentUserMock.mockReset();
  getDuplicateCandidateDetailMock.mockReset();
  getUserProgressTrackingModeMock.mockReset();
  getWorkProgressViewMock.mockReset();
  listDuplicateCandidatesMock.mockReset();
  mergeDuplicateCandidateMock.mockReset();
  updateDuplicateCandidateStatusMock.mockReset();
  updateUserProgressTrackingModeMock.mockReset();
  updateWorkProgressTrackingModeMock.mockReset();
});

describe("library server functions", () => {
  it("lists and loads duplicate candidates", async () => {
    const server = await import("./library-server");
    listDuplicateCandidatesMock.mockResolvedValueOnce([{ id: "candidate-1" }]);
    getDuplicateCandidateDetailMock.mockResolvedValueOnce({ id: "candidate-1" });

    await expect(
      server.listDuplicateCandidatesServerFn({ data: { status: ReviewStatus.PENDING } }),
    ).resolves.toEqual([{ id: "candidate-1" }]);
    await expect(
      server.getDuplicateCandidateDetailServerFn({ data: { candidateId: "candidate-1" } }),
    ).resolves.toEqual({ id: "candidate-1" });
  });

  it("requires authentication for mutations", async () => {
    const server = await import("./library-server");
    getCurrentUserMock.mockResolvedValue(null);

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
    updateDuplicateCandidateStatusMock.mockResolvedValueOnce({ status: ReviewStatus.IGNORED });
    mergeDuplicateCandidateMock.mockResolvedValueOnce({ status: ReviewStatus.MERGED });
    getUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_EDITION);
    updateUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_WORK);
    getWorkProgressViewMock.mockResolvedValueOnce({ workId: "work-1" });
    updateWorkProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_WORK);

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
    listDuplicateCandidatesMock.mockResolvedValueOnce([{ id: "candidate-9" }]);
    getDuplicateCandidateDetailMock.mockResolvedValueOnce({ id: "candidate-9" });
    updateDuplicateCandidateStatusMock.mockResolvedValueOnce({ status: ReviewStatus.CONFIRMED });
    mergeDuplicateCandidateMock.mockResolvedValueOnce({ status: ReviewStatus.MERGED });
    getUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_WORK);
    updateUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_EDITION);
    getWorkProgressViewMock.mockResolvedValueOnce({ workId: "work-9" });
    updateWorkProgressTrackingModeMock.mockResolvedValueOnce(null);

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

    expect(
      server.validateListDuplicateCandidatesInput({ status: ReviewStatus.PENDING }),
    ).toEqual({ status: ReviewStatus.PENDING });
    expect(
      server.validateGetDuplicateCandidateDetailInput({ candidateId: "candidate-1" }),
    ).toEqual({ candidateId: "candidate-1" });
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
});
