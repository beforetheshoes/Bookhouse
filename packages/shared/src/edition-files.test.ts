import { describe, expect, it } from "vitest";
import {
  isKoboDeliveryMediaKind,
  isMetadataSourceMediaKind,
  selectPreferredKoboDeliveryFile,
  selectPreferredMetadataSourceFile,
} from "./edition-files";

describe("edition file selection", () => {
  it("selects EPUB over lower-priority metadata sources", () => {
    const selected = selectPreferredMetadataSourceFile([
      {
        id: "pdf",
        role: "PRIMARY",
        fileAsset: { basename: "book.pdf", mediaKind: "PDF" },
      },
      {
        id: "epub",
        role: "ALTERNATE_FORMAT",
        fileAsset: { basename: "book.epub", mediaKind: "EPUB" },
      },
    ]);

    expect(selected?.id).toBe("epub");
  });

  it("prefers the PRIMARY role when metadata candidates share the same media kind", () => {
    const selected = selectPreferredMetadataSourceFile([
      {
        id: "alternate",
        role: "ALTERNATE_FORMAT",
        fileAsset: { basename: "b-book.epub", mediaKind: "EPUB" },
      },
      {
        id: "primary",
        role: "PRIMARY",
        fileAsset: { basename: "a-book.epub", mediaKind: "EPUB" },
      },
    ]);

    expect(selected?.id).toBe("primary");
  });

  it("returns null when no metadata-source media kinds are present", () => {
    expect(selectPreferredMetadataSourceFile([
      {
        id: "audio",
        role: "PRIMARY",
        fileAsset: { basename: "track.mp3", mediaKind: "AUDIO" },
      },
    ])).toBeNull();
  });

  it("prefers KEPUB over EPUB for Kobo delivery", () => {
    const selected = selectPreferredKoboDeliveryFile([
      {
        id: "epub",
        role: "PRIMARY",
        fileAsset: { basename: "book.epub", mediaKind: "EPUB" },
      },
      {
        id: "kepub",
        role: "ALTERNATE_FORMAT",
        fileAsset: { basename: "book.kepub.epub", mediaKind: "KEPUB" },
      },
    ]);

    expect(selected?.id).toBe("kepub");
  });

  it("returns null when no Kobo delivery format exists", () => {
    expect(selectPreferredKoboDeliveryFile([
      {
        id: "pdf",
        role: "PRIMARY",
        fileAsset: { basename: "book.pdf", mediaKind: "PDF" },
      },
    ])).toBeNull();
  });

  it("recognizes supported metadata and Kobo delivery media kinds", () => {
    expect(isMetadataSourceMediaKind("EPUB")).toBe(true);
    expect(isMetadataSourceMediaKind("AUDIO")).toBe(false);
    expect(isKoboDeliveryMediaKind("KEPUB")).toBe(true);
    expect(isKoboDeliveryMediaKind("PDF")).toBe(false);
  });
});
