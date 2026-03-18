import { startTransition } from "react";
import { ProgressTrackingMode, ReviewStatus } from "@bookhouse/domain";

type RouterLike = {
  invalidate: () => Promise<unknown>;
  navigate: (...args: any[]) => Promise<unknown>;
};

export function createDuplicateStatusHandler(input: {
  candidateId: string;
  pendingValue: string;
  router: Pick<RouterLike, "invalidate">;
  setPending: (value: string | null) => void;
  status: ReviewStatus;
  updateStatus: (input: {
    data: {
      candidateId: string;
      status: ReviewStatus;
    };
  }) => Promise<unknown>;
}) {
  return () => {
    input.setPending(input.pendingValue);
    startTransition(async () => {
      await input.updateStatus({
        data: {
          candidateId: input.candidateId,
          status: input.status,
        },
      });
      await input.router.invalidate();
      input.setPending(null);
    });
  };
}

export function createAudioLinkStatusHandler(input: {
  linkId: string;
  pendingValue: string;
  router: Pick<RouterLike, "invalidate">;
  setPending: (value: string | null) => void;
  status: ReviewStatus;
  updateStatus: (input: {
    data: {
      linkId: string;
      status: ReviewStatus;
    };
  }) => Promise<unknown>;
}) {
  return () => {
    input.setPending(input.pendingValue);
    startTransition(async () => {
      await input.updateStatus({
        data: {
          linkId: input.linkId,
          status: input.status,
        },
      });
      await input.router.invalidate();
      input.setPending(null);
    });
  };
}

export function createDuplicateMergeHandler(input: {
  candidateId: string;
  pendingValue: string;
  router: Pick<RouterLike, "navigate">;
  setPending: (value: string | null) => void;
  survivorSide: "left" | "right";
  mergeCandidate: (input: {
    data: {
      candidateId: string;
      survivorSide: "left" | "right";
    };
  }) => Promise<unknown>;
}) {
  return () => {
    input.setPending(input.pendingValue);
    startTransition(async () => {
      await input.mergeCandidate({
        data: {
          candidateId: input.candidateId,
          survivorSide: input.survivorSide,
        },
      });
      await input.router.navigate({ to: "/duplicates" });
      input.setPending(null);
    });
  };
}

export function createGlobalProgressModeHandler(input: {
  progressTrackingMode: ProgressTrackingMode;
  router: Pick<RouterLike, "invalidate">;
  setPending: (value: boolean) => void;
  updateMode: (input: {
    data: {
      progressTrackingMode: ProgressTrackingMode;
    };
  }) => Promise<unknown>;
}) {
  return () => {
    input.setPending(true);
    startTransition(async () => {
      await input.updateMode({
        data: {
          progressTrackingMode: input.progressTrackingMode,
        },
      });
      await input.router.invalidate();
      input.setPending(false);
    });
  };
}

export function createWorkProgressModeHandler(input: {
  progressTrackingMode: ProgressTrackingMode | null;
  router: Pick<RouterLike, "invalidate">;
  setPending: (value: boolean) => void;
  updateMode: (input: {
    data: {
      progressTrackingMode: ProgressTrackingMode | null;
      workId: string;
    };
  }) => Promise<unknown>;
  workId: string;
}) {
  return () => {
    input.setPending(true);
    startTransition(async () => {
      await input.updateMode({
        data: {
          progressTrackingMode: input.progressTrackingMode,
          workId: input.workId,
        },
      });
      await input.router.invalidate();
      input.setPending(false);
    });
  };
}

export function createCollectionMutationHandler(input: {
  action: () => Promise<unknown>;
  onSuccess?: () => Promise<unknown>;
  router: Pick<RouterLike, "invalidate" | "navigate">;
  setPending: (value: boolean) => void;
}) {
  return () => {
    input.setPending(true);
    startTransition(async () => {
      await input.action();
      if (input.onSuccess) {
        await input.onSuccess();
      } else {
        await input.router.invalidate();
      }
      input.setPending(false);
    });
  };
}

export function createCollectionMembershipHandler(input: {
  action: (input: {
    data: {
      collectionId: string;
      workId: string;
    };
  }) => Promise<unknown>;
  collectionId: string;
  router: Pick<RouterLike, "invalidate">;
  setPending: (value: string | null) => void;
  workId: string;
}) {
  return () => {
    input.setPending(input.collectionId);
    startTransition(async () => {
      await input.action({
        data: {
          collectionId: input.collectionId,
          workId: input.workId,
        },
      });
      await input.router.invalidate();
      input.setPending(null);
    });
  };
}

export function createExternalLinkMutationHandler(input: {
  action: () => Promise<unknown>;
  pendingValue: string;
  router: Pick<RouterLike, "invalidate">;
  setPending: (value: string | null) => void;
}) {
  return () => {
    input.setPending(input.pendingValue);
    startTransition(async () => {
      await input.action();
      await input.router.invalidate();
      input.setPending(null);
    });
  };
}
