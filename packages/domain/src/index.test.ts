import { describe, expect, it } from "vitest";
import {
  AvailabilityStatus,
  BATCH1_DOMAIN_MODEL_NAMES,
  DuplicateReason,
  EditionFileRole,
  EnrichmentStatus,
  FormatFamily,
  ImportJobKind,
  ImportJobStatus,
  LibraryRootKind,
  MediaKind,
  ReviewStatus,
  ScanMode,
} from "./index";
import type { Batch1DomainModels, DuplicateCandidate, ImportJob } from "./index";

describe("domain package", () => {
  it("re-exports the batch 1 model enums", () => {
    expect(LibraryRootKind.MIXED).toBe("MIXED");
    expect(ScanMode.INCREMENTAL).toBe("INCREMENTAL");
    expect(MediaKind.EPUB).toBe("EPUB");
    expect(AvailabilityStatus.MISSING).toBe("MISSING");
    expect(FormatFamily.EBOOK).toBe("EBOOK");
    expect(EditionFileRole.PRIMARY).toBe("PRIMARY");
    expect(DuplicateReason.SAME_HASH).toBe("SAME_HASH");
    expect(ReviewStatus.PENDING).toBe("PENDING");
    expect(ImportJobKind.SCAN_ROOT).toBe("SCAN_ROOT");
    expect(EnrichmentStatus.STUB).toBe("STUB");
    expect(EnrichmentStatus.ENRICHED).toBe("ENRICHED");
    expect(ImportJobStatus.QUEUED).toBe("QUEUED");
    expect(BATCH1_DOMAIN_MODEL_NAMES).toEqual([
      "LibraryRoot",
      "FileAsset",
      "Work",
      "Edition",
      "EditionFile",
      "Contributor",
      "Series",
      "DuplicateCandidate",
    ]);
  });

  it("includes duplicate candidates in the batch 1 domain model map", () => {
    const duplicateCandidate = null as DuplicateCandidate | null;
    const batchModelDuplicateCandidate = null as Batch1DomainModels["duplicateCandidate"] | null;

    expect(duplicateCandidate).toBeNull();
    expect(batchModelDuplicateCandidate).toBeNull();
  });

  it("re-exports ImportJob types", () => {
    const importJob = null as ImportJob | null;
    expect(importJob).toBeNull();
  });
});
