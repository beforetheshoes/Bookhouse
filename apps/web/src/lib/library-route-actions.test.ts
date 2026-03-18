import { ProgressTrackingMode, ReviewStatus } from "@bookhouse/domain";
import {
  createAudioLinkStatusHandler,
  createDuplicateMergeHandler,
  createDuplicateStatusHandler,
  createGlobalProgressModeHandler,
  createWorkProgressModeHandler,
} from "./library-route-actions";
import { describe, expect, it, vi } from "vitest";

describe("library route actions", () => {
  it("updates audio link status and invalidates the router", async () => {
    const invalidate = vi.fn(async () => undefined);
    const setPending = vi.fn();
    const updateStatus = vi.fn(async () => undefined);

    createAudioLinkStatusHandler({
      linkId: "audio-link-1",
      pendingValue: "audio-link-1",
      router: { invalidate },
      setPending,
      status: ReviewStatus.IGNORED,
      updateStatus,
    })();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setPending).toHaveBeenNthCalledWith(1, "audio-link-1");
    expect(updateStatus).toHaveBeenCalledWith({
      data: {
        linkId: "audio-link-1",
        status: ReviewStatus.IGNORED,
      },
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(setPending).toHaveBeenLastCalledWith(null);
  });

  it("updates duplicate status and invalidates the router", async () => {
    const invalidate = vi.fn(async () => undefined);
    const setPending = vi.fn();
    const updateStatus = vi.fn(async () => undefined);

    createDuplicateStatusHandler({
      candidateId: "candidate-1",
      pendingValue: "candidate-1",
      router: { invalidate },
      setPending,
      status: ReviewStatus.CONFIRMED,
      updateStatus,
    })();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setPending).toHaveBeenNthCalledWith(1, "candidate-1");
    expect(updateStatus).toHaveBeenCalledWith({
      data: {
        candidateId: "candidate-1",
        status: ReviewStatus.CONFIRMED,
      },
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(setPending).toHaveBeenLastCalledWith(null);
  });

  it("merges a duplicate and navigates back to the queue", async () => {
    const navigate = vi.fn(async () => undefined);
    const setPending = vi.fn();
    const mergeCandidate = vi.fn(async () => undefined);

    createDuplicateMergeHandler({
      candidateId: "candidate-1",
      pendingValue: "merge-left",
      router: { navigate },
      setPending,
      survivorSide: "left",
      mergeCandidate,
    })();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mergeCandidate).toHaveBeenCalledWith({
      data: {
        candidateId: "candidate-1",
        survivorSide: "left",
      },
    });
    expect(navigate).toHaveBeenCalledWith({ to: "/duplicates" });
    expect(setPending).toHaveBeenLastCalledWith(null);
  });

  it("updates global and per-work progress preferences", async () => {
    const invalidate = vi.fn(async () => undefined);
    const setPending = vi.fn();
    const updateGlobalMode = vi.fn(async () => undefined);
    const updateWorkMode = vi.fn(async () => undefined);

    createGlobalProgressModeHandler({
      progressTrackingMode: ProgressTrackingMode.BY_WORK,
      router: { invalidate },
      setPending,
      updateMode: updateGlobalMode,
    })();
    createWorkProgressModeHandler({
      progressTrackingMode: null,
      router: { invalidate },
      setPending,
      updateMode: updateWorkMode,
      workId: "work-1",
    })();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updateGlobalMode).toHaveBeenCalledWith({
      data: {
        progressTrackingMode: ProgressTrackingMode.BY_WORK,
      },
    });
    expect(updateWorkMode).toHaveBeenCalledWith({
      data: {
        progressTrackingMode: null,
        workId: "work-1",
      },
    });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
