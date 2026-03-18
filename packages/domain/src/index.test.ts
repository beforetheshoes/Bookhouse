import { describe, expect, it } from "vitest";
import {
  AvailabilityStatus,
  BATCH1_DOMAIN_MODEL_NAMES,
  DuplicateReason,
  EditionFileRole,
  FormatFamily,
  LibraryRootKind,
  MediaKind,
  ProgressTrackingMode,
  ReviewStatus,
  ScanMode,
} from "./index";
import type {
  Batch1DomainModels,
  DuplicateCandidate,
  UserPreference,
  WorkProgressPreference,
} from "./index";

describe("domain package", () => {
  it("re-exports the batch 1 model enums", () => {
    expect(LibraryRootKind.MIXED).toBe("MIXED");
    expect(ScanMode.INCREMENTAL).toBe("INCREMENTAL");
    expect(MediaKind.EPUB).toBe("EPUB");
    expect(AvailabilityStatus.MISSING).toBe("MISSING");
    expect(FormatFamily.EBOOK).toBe("EBOOK");
    expect(EditionFileRole.PRIMARY).toBe("PRIMARY");
    expect(DuplicateReason.SAME_HASH).toBe("SAME_HASH");
    expect(ProgressTrackingMode.BY_WORK).toBe("BY_WORK");
    expect(ReviewStatus.PENDING).toBe("PENDING");
    expect(BATCH1_DOMAIN_MODEL_NAMES).toEqual([
      "LibraryRoot",
      "FileAsset",
      "Work",
      "Edition",
      "EditionFile",
      "Contributor",
      "Series",
      "DuplicateCandidate",
      "UserPreference",
      "WorkProgressPreference",
    ]);
  });

  it("includes duplicate and progress preference models in the batch 1 domain model map", () => {
    const duplicateCandidate = null as DuplicateCandidate | null;
    const batchModelDuplicateCandidate = null as Batch1DomainModels["duplicateCandidate"] | null;
    const userPreference = null as UserPreference | null;
    const batchModelUserPreference = null as Batch1DomainModels["userPreference"] | null;
    const workProgressPreference = null as WorkProgressPreference | null;
    const batchModelWorkProgressPreference = null as Batch1DomainModels["workProgressPreference"] | null;

    expect(duplicateCandidate).toBeNull();
    expect(batchModelDuplicateCandidate).toBeNull();
    expect(userPreference).toBeNull();
    expect(batchModelUserPreference).toBeNull();
    expect(workProgressPreference).toBeNull();
    expect(batchModelWorkProgressPreference).toBeNull();
  });
});
