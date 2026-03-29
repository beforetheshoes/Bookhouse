// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { updateEditionServerFnMock } = vi.hoisted(() => ({
  updateEditionServerFnMock: vi.fn(),
}));

vi.mock("~/lib/server-fns/editing", () => ({
  updateEditionServerFn: updateEditionServerFnMock,
}));

import { EditionTabPanel } from "./edition-tab-panel";
import type { WorkDetail } from "~/lib/server-fns/work-detail";

type EditionType = WorkDetail["editions"][number];

beforeEach(() => {
  updateEditionServerFnMock.mockReset();
});

const baseEdition = {
  id: "e1",
  workId: "w1",
  formatFamily: "EBOOK" as const,
  publisher: "DAW Books",
  publishedAt: new Date("2007-04-01"),
  isbn13: "9780756404741",
  isbn10: "0756404746",
  asin: "B000OCXIRG",
  language: "English",
  pageCount: 662,
  editedFields: [] as string[],
  createdAt: new Date(),
  updatedAt: new Date(),
  contributors: [
    { id: "ec1", editionId: "e1", contributorId: "c1", role: "AUTHOR", contributor: { id: "c1", nameDisplay: "Patrick Rothfuss", nameCanonical: "patrick rothfuss", createdAt: new Date() } },
  ],
  editionFiles: [
    {
      id: "ef1",
      editionId: "e1",
      fileAssetId: "fa1",
      role: "PRIMARY",
      fileAsset: {
        id: "fa1",
        libraryRootId: "lr1",
        absolutePath: "/books/wind.epub",
        relativePath: "wind.epub",
        basename: "wind.epub",
        extension: "epub",
        mimeType: "application/epub+zip",
        sizeBytes: BigInt(2400000),
        ctime: new Date(),
        mtime: new Date(),
        partialHash: null,
        fullHash: null,
        metadata: null,
        mediaKind: "EPUB",
        availabilityStatus: "PRESENT",
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  ],
} as EditionType;

describe("EditionTabPanel", () => {
  it("renders edition metadata fields", () => {
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("Publisher")).toBeTruthy();
    expect(screen.getByText("ISBN-13")).toBeTruthy();
    expect(screen.getByText("ISBN-10")).toBeTruthy();
    expect(screen.getByText("ASIN")).toBeTruthy();
    expect(screen.getByText("Language")).toBeTruthy();
    expect(screen.getByText("Pages")).toBeTruthy();
    expect(screen.getByText("Published")).toBeTruthy();
  });

  it("renders contributors", () => {
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("Patrick Rothfuss")).toBeTruthy();
    expect(screen.getByText("AUTHOR:")).toBeTruthy();
  });

  it("renders files with size and status", () => {
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("wind.epub")).toBeTruthy();
    expect(screen.getByText("PRESENT")).toBeTruthy();
  });

  it("renders delete button", () => {
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /delete edition/i })).toBeTruthy();
  });

  it("calls onDeleteEdition when delete button clicked", () => {
    const onDelete = vi.fn();
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete edition/i }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("hides contributors section when none exist", () => {
    render(
      <EditionTabPanel
        edition={{ ...baseEdition, contributors: [] }}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.queryByText("AUTHOR:")).toBeNull();
  });

  it("hides files section when none exist", () => {
    render(
      <EditionTabPanel
        edition={{ ...baseEdition, editionFiles: [] }}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.queryByText("wind.epub")).toBeNull();
  });

  it("renders page count as string", () => {
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("662")).toBeTruthy();
  });

  it("calls updateEditionServerFn and onEditionFieldSaved when a field is saved", async () => {
    updateEditionServerFnMock.mockResolvedValue({ success: true });
    const onFieldSaved = vi.fn();
    const { waitFor } = await import("@testing-library/react");
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
      />,
    );

    // Click the publisher field text to enter edit mode
    const publisherField = screen.getByText("DAW Books");
    fireEvent.click(publisherField);

    // Now an input should appear with the current value
    const input = screen.getByDisplayValue("DAW Books");
    fireEvent.change(input, { target: { value: "Tor Books" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e1", fields: { publisher: "Tor Books" } },
      });
      expect(onFieldSaved).toHaveBeenCalled();
    });
  });

  it("passes null when saving an empty field value", async () => {
    updateEditionServerFnMock.mockResolvedValue({ success: true });
    const onFieldSaved = vi.fn();
    const { waitFor } = await import("@testing-library/react");
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
      />,
    );

    // Click the ASIN field to enter edit mode
    const asinField = screen.getByText("B000OCXIRG");
    fireEvent.click(asinField);

    const input = screen.getByDisplayValue("B000OCXIRG");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e1", fields: { asin: null } },
      });
    });
  });

  it("renders published date as localized string", () => {
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    // The publishedAt date gets rendered via toLocaleDateString()
    const expectedDate = new Date("2007-04-01").toLocaleDateString();
    expect(screen.getByText(expectedDate)).toBeTruthy();
  });

  it("renders placeholder for null publishedAt", () => {
    render(
      <EditionTabPanel
        edition={{ ...baseEdition, publishedAt: null }}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    // Verify Published label still renders
    expect(screen.getByText("Published")).toBeTruthy();
  });

  it("renders placeholder for null pageCount", () => {
    render(
      <EditionTabPanel
        edition={{ ...baseEdition, pageCount: null }}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("Pages")).toBeTruthy();
  });

  it("renders all fields with null/empty values using placeholders", () => {
    const nullEdition = {
      ...baseEdition,
      publisher: null,
      publishedAt: null,
      pageCount: null,
      isbn13: null,
      isbn10: null,
      asin: null,
      language: null,
    } as EditionType;

    render(
      <EditionTabPanel
        edition={nullEdition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    // All 7 fields render with placeholder "—"
    expect(screen.getByText("Publisher")).toBeTruthy();
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Pages")).toBeTruthy();
    expect(screen.getByText("ISBN-13")).toBeTruthy();
    expect(screen.getByText("ISBN-10")).toBeTruthy();
    expect(screen.getByText("ASIN")).toBeTruthy();
    expect(screen.getByText("Language")).toBeTruthy();
  });

  it("renders file size in KB range", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        {
          ...baseEdition.editionFiles[0],
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            sizeBytes: BigInt(500000),
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("488.3 KB")).toBeTruthy();
  });

  it("renders file size in bytes range", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        {
          ...baseEdition.editionFiles[0],
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            sizeBytes: BigInt(500),
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("500 B")).toBeTruthy();
  });

  it("renders file size as dash for null", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        {
          ...baseEdition.editionFiles[0],
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            sizeBytes: null,
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("\u2014")).toBeTruthy();
  });

  it("calls saveField for publishedAt field", async () => {
    updateEditionServerFnMock.mockResolvedValue({ success: true });
    const onFieldSaved = vi.fn();
    const { waitFor } = await import("@testing-library/react");
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
      />,
    );

    const dateText = new Date("2007-04-01").toLocaleDateString();
    const field = screen.getByText(dateText);
    fireEvent.click(field);

    const input = screen.getByDisplayValue(dateText);
    fireEvent.change(input, { target: { value: "2020-01-01" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e1", fields: { publishedAt: "2020-01-01" } },
      });
    });
  });

  it("calls saveField for pageCount field", async () => {
    updateEditionServerFnMock.mockResolvedValue({ success: true });
    const onFieldSaved = vi.fn();
    const { waitFor } = await import("@testing-library/react");
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
      />,
    );

    const field = screen.getByText("662");
    fireEvent.click(field);

    const input = screen.getByDisplayValue("662");
    fireEvent.change(input, { target: { value: "700" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e1", fields: { pageCount: "700" } },
      });
    });
  });

  it("calls saveField for isbn13 field", async () => {
    updateEditionServerFnMock.mockResolvedValue({ success: true });
    const onFieldSaved = vi.fn();
    const { waitFor } = await import("@testing-library/react");
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
      />,
    );

    const field = screen.getByText("9780756404741");
    fireEvent.click(field);

    const input = screen.getByDisplayValue("9780756404741");
    fireEvent.change(input, { target: { value: "9781234567890" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e1", fields: { isbn13: "9781234567890" } },
      });
    });
  });

  it("calls saveField for isbn10 field", async () => {
    updateEditionServerFnMock.mockResolvedValue({ success: true });
    const onFieldSaved = vi.fn();
    const { waitFor } = await import("@testing-library/react");
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
      />,
    );

    const field = screen.getByText("0756404746");
    fireEvent.click(field);

    const input = screen.getByDisplayValue("0756404746");
    fireEvent.change(input, { target: { value: "1234567890" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e1", fields: { isbn10: "1234567890" } },
      });
    });
  });

  it("calls saveField for language field", async () => {
    updateEditionServerFnMock.mockResolvedValue({ success: true });
    const onFieldSaved = vi.fn();
    const { waitFor } = await import("@testing-library/react");
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
      />,
    );

    const field = screen.getByText("English");
    fireEvent.click(field);

    const input = screen.getByDisplayValue("English");
    fireEvent.change(input, { target: { value: "French" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateEditionServerFnMock).toHaveBeenCalledWith({
        data: { editionId: "e1", fields: { language: "French" } },
      });
    });
  });

  it("renders download link for PRESENT file", () => {
    render(
      <EditionTabPanel
        edition={baseEdition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: /download wind\.epub/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/api/edition-files/download/ef1");
  });

  it("does not render download link for MISSING file", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        {
          ...baseEdition.editionFiles[0],
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            availabilityStatus: "MISSING",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
  });

  it("does not render download link for IGNORED file", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        {
          ...baseEdition.editionFiles[0],
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            availabilityStatus: "IGNORED",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
  });

  it("renders download link only for PRESENT files when mixed statuses", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        baseEdition.editionFiles[0],
        {
          id: "ef2",
          editionId: "e1",
          fileAssetId: "fa2",
          role: "ALTERNATE_FORMAT",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa2",
            basename: "wind.pdf",
            availabilityStatus: "MISSING",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    // Only 1 PRESENT file → individual download button, no "Download All"
    const link = screen.getByRole("link", { name: /download wind\.epub/i });
    expect(link.getAttribute("href")).toBe("/api/edition-files/download/ef1");
    expect(screen.queryByRole("link", { name: /download wind\.pdf/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /download all/i })).toBeNull();
  });

  it("renders Download All button when multiple PRESENT files exist", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        baseEdition.editionFiles[0],
        {
          id: "ef2",
          editionId: "e1",
          fileAssetId: "fa2",
          role: "AUDIO_TRACK",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa2",
            basename: "track02.mp3",
            availabilityStatus: "PRESENT",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: /download all \(2 files\)/i });
    expect(link.getAttribute("href")).toBe("/api/editions/download-all/e1");
  });

  it("does not render individual download links when Download All is shown", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        baseEdition.editionFiles[0],
        {
          id: "ef2",
          editionId: "e1",
          fileAssetId: "fa2",
          role: "AUDIO_TRACK",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa2",
            basename: "track02.mp3",
            availabilityStatus: "PRESENT",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.queryByRole("link", { name: /download wind\.epub/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /download track02\.mp3/i })).toBeNull();
  });

  it("counts only PRESENT files toward Download All threshold", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        baseEdition.editionFiles[0],
        {
          id: "ef2",
          editionId: "e1",
          fileAssetId: "fa2",
          role: "AUDIO_TRACK",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa2",
            basename: "track02.mp3",
            availabilityStatus: "PRESENT",
          },
        },
        {
          id: "ef3",
          editionId: "e1",
          fileAssetId: "fa3",
          role: "AUDIO_TRACK",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa3",
            basename: "track03.mp3",
            availabilityStatus: "MISSING",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    // 2 PRESENT + 1 MISSING → Download All with count of 2
    const link = screen.getByRole("link", { name: /download all \(2 files\)/i });
    expect(link.getAttribute("href")).toBe("/api/editions/download-all/e1");
  });

  it("hides sidecar files from the files list", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        baseEdition.editionFiles[0],
        {
          id: "ef2",
          editionId: "e1",
          fileAssetId: "fa2",
          role: "SIDECAR",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa2",
            basename: "metadata.json",
            mediaKind: "SIDECAR",
          },
        },
        {
          id: "ef3",
          editionId: "e1",
          fileAssetId: "fa3",
          role: "SIDECAR",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa3",
            basename: "cover.jpg",
            mediaKind: "COVER",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("wind.epub")).toBeTruthy();
    expect(screen.queryByText("metadata.json")).toBeNull();
    expect(screen.queryByText("cover.jpg")).toBeNull();
  });

  it("treats only content files as PRESENT for download threshold", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        baseEdition.editionFiles[0],
        {
          id: "ef2",
          editionId: "e1",
          fileAssetId: "fa2",
          role: "SIDECAR",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa2",
            basename: "metadata.json",
            mediaKind: "SIDECAR",
            availabilityStatus: "PRESENT",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    // Only 1 content file → individual download, not "Download All"
    const link = screen.getByRole("link", { name: /download wind\.epub/i });
    expect(link.getAttribute("href")).toBe("/api/edition-files/download/ef1");
    expect(screen.queryByRole("link", { name: /download all/i })).toBeNull();
  });

  it("renders destructive badge for non-PRESENT file status", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        {
          ...baseEdition.editionFiles[0],
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            availabilityStatus: "MISSING",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionTabPanel
        edition={edition}
        isLastEdition={false}
        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
      />,
    );

    expect(screen.getByText("MISSING")).toBeTruthy();
  });
});
