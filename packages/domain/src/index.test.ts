import { describe, expect, it } from "vitest";
import {
  AvailabilityStatus,
  BATCH1_DOMAIN_MODEL_NAMES,
  EditionFileRole,
  FormatFamily,
  LibraryRootKind,
  MediaKind,
  ScanMode,
} from "./index";

describe("domain package", () => {
  it("re-exports the batch 1 model enums", () => {
    expect(LibraryRootKind.MIXED).toBe("MIXED");
    expect(ScanMode.INCREMENTAL).toBe("INCREMENTAL");
    expect(MediaKind.EPUB).toBe("EPUB");
    expect(AvailabilityStatus.MISSING).toBe("MISSING");
    expect(FormatFamily.EBOOK).toBe("EBOOK");
    expect(EditionFileRole.PRIMARY).toBe("PRIMARY");
    expect(BATCH1_DOMAIN_MODEL_NAMES).toEqual([
      "LibraryRoot",
      "FileAsset",
      "Work",
      "Edition",
      "EditionFile",
      "Contributor",
      "Series",
    ]);
  });
});
