import { describe, expect, it } from "vitest";
import * as ingest from "./index";

describe("ingest package barrel", () => {
  it("re-exports the primary runtime entry points", () => {
    expect(ingest.classifyMediaKind("/books/Book.kepub")).toBe("KEPUB");
    expect(ingest.classifyMediaKind("/books/Book.kepub.epub")).toBe("KEPUB");
    expect(ingest.deriveFormatFamily("EPUB")).toBe("EBOOK");
    expect(typeof ingest.createIngestServices).toBe("function");
    expect(typeof ingest.extractEpubCover).toBe("function");
    expect(typeof ingest.processCoverForWork).toBe("function");
    expect(typeof ingest.hashFileContents).toBe("function");
    expect(typeof ingest.searchOpenLibrary).toBe("function");
    expect(typeof ingest.enrichContributor).toBe("function");
    expect(typeof ingest.cascadeCleanupOrphans).toBe("function");
    expect(ingest.SCAN_PROGRESS_INTERVAL).toBeGreaterThan(0);
    expect(ingest.PARTIAL_HASH_BYTES).toBeGreaterThan(0);
    expect(ingest.VALID_WORK_ID.test("work-1")).toBe(true);
  });
});
