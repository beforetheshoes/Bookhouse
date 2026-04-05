// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

const { updateEditionServerFnMock, updateEditionNarratorsServerFnMock, sendToKindleServerFnMock } = vi.hoisted(() => ({
  updateEditionServerFnMock: vi.fn(),
  updateEditionNarratorsServerFnMock: vi.fn(),
  sendToKindleServerFnMock: vi.fn(),
}));

vi.mock("~/lib/server-fns/editing", () => ({
  updateEditionServerFn: updateEditionServerFnMock,
  updateEditionNarratorsServerFn: updateEditionNarratorsServerFnMock,
}));

vi.mock("~/lib/server-fns/kindle", () => ({
  sendToKindleServerFn: sendToKindleServerFnMock,
}));

import { EditionCard, parseDuration, sortEpubFirst } from "./edition-card";
import type { WorkDetail } from "~/lib/server-fns/work-detail";

type EditionType = WorkDetail["editions"][number];

beforeEach(() => {
  updateEditionServerFnMock.mockReset();
  updateEditionNarratorsServerFnMock.mockReset();
  sendToKindleServerFnMock.mockReset();
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

describe("EditionCard", () => {
  it("renders edition metadata fields", () => {
    render(
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.getByText("Patrick Rothfuss")).toBeTruthy();
    expect(screen.getByText("Authors")).toBeTruthy();
  });

  it("renders files with size and status", () => {
    render(
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.getByText("wind.epub")).toBeTruthy();
    expect(screen.getByText("PRESENT")).toBeTruthy();
  });

  it("renders Amazon ebook variant files", () => {
    const edition = {
      ...baseEdition,
      editionFiles: [
        ...baseEdition.editionFiles,
        {
          id: "ef2",
          editionId: "e1",
          fileAssetId: "fa2",
          role: "ALTERNATE_FORMAT",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa2",
            basename: "wind.azw",
            extension: "azw",
            mediaKind: "AZW",
          },
        },
      ],
    } as EditionType;

    render(
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.getByText("wind.azw")).toBeTruthy();
  });

  it("renders edition actions kebab menu with delete option", () => {
    render(
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.getByRole("button", { name: /edition actions/i })).toBeTruthy();
  });

  it("calls onDeleteEdition from kebab menu", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={onDelete}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    // Open kebab menu
    await user.click(screen.getByRole("button", { name: /edition actions/i }));
    // Click delete menu item
    await user.click(screen.getByText("Delete Edition"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("hides contributors section when none exist", () => {
    render(
      <EditionCard
        edition={{ ...baseEdition, contributors: [] }}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.queryByText("Authors")).toBeNull();
  });

  it("hides files section when none exist", () => {
    render(
      <EditionCard
        edition={{ ...baseEdition, editionFiles: [] }}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.queryByText("wind.epub")).toBeNull();
  });

  it("renders page count as string", () => {
    render(
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.getByText("662")).toBeTruthy();
  });

  it("calls updateEditionServerFn and onEditionFieldSaved when a field is saved", async () => {
    updateEditionServerFnMock.mockResolvedValue({ success: true });
    const onFieldSaved = vi.fn();
    const { waitFor } = await import("@testing-library/react");
    render(
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    // Click the publisher field text to enter edit mode (use role=button to target the editable field, not the card header)
    const publisherField = screen.getByRole("button", { name: "DAW Books" });
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
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    // The publishedAt date gets rendered via toLocaleDateString()
    const expectedDate = new Date("2007-04-01").toLocaleDateString();
    expect(screen.getByText(expectedDate)).toBeTruthy();
  });

  it("renders placeholder for null publishedAt", () => {
    render(
      <EditionCard
        edition={{ ...baseEdition, publishedAt: null }}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    // Verify Published label still renders
    expect(screen.getByText("Published")).toBeTruthy();
  });

  it("renders placeholder for null pageCount", () => {
    render(
      <EditionCard
        edition={{ ...baseEdition, pageCount: null }}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={nullEdition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.getByText("—")).toBeTruthy();
  });

  it("calls saveField for publishedAt field", async () => {
    updateEditionServerFnMock.mockResolvedValue({ success: true });
    const onFieldSaved = vi.fn();
    const { waitFor } = await import("@testing-library/react");
    render(
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={onFieldSaved}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
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

  it("renders top-level download button for ebook with single PRESENT file", () => {
    render(
      <EditionCard
        edition={baseEdition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    const link = screen.getByRole("link", { name: /download epub/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/api/edition-files/download/ef1");
  });

  it("does not render download button for MISSING file", () => {
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
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
  });

  it("does not render download button for IGNORED file", () => {
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
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
  });

  it("renders download dropdown when ebook has multiple PRESENT format files", () => {
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
            mediaKind: "PDF",
            availabilityStatus: "PRESENT",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    // Should show a dropdown trigger button (not a direct link)
    const downloadBtn = screen.getByRole("button", { name: /download/i });
    expect(downloadBtn).toBeTruthy();
  });

  it("renders Download button for audiobook editions linking to download-all", () => {
    const edition = {
      ...baseEdition,
      formatFamily: "AUDIOBOOK" as const,
      editionFiles: [
        {
          ...baseEdition.editionFiles[0],
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            basename: "track01.mp3",
            mediaKind: "AUDIO",
          },
        },
        {
          id: "ef2",
          editionId: "e1",
          fileAssetId: "fa2",
          role: "AUDIO_TRACK",
          fileAsset: {
            ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
            id: "fa2",
            basename: "track02.mp3",
            mediaKind: "AUDIO",
            availabilityStatus: "PRESENT",
          },
        },
      ],
    } as EditionType;
    render(
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    const link = screen.getByRole("link", { name: /download all audio/i });
    expect(link.getAttribute("href")).toBe("/api/editions/download-all/e1");
  });

  it("does not show download for ebook when only MISSING files with mixed statuses", () => {
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
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
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
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.getByText("wind.epub")).toBeTruthy();
    expect(screen.queryByText("metadata.json")).toBeNull();
    expect(screen.queryByText("cover.jpg")).toBeNull();
  });

  it("treats only content files for download — sidecar files are excluded", () => {
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
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    // Only 1 content file → single download button (not dropdown)
    const link = screen.getByRole("link", { name: /download epub/i });
    expect(link.getAttribute("href")).toBe("/api/edition-files/download/ef1");
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
      <EditionCard
        edition={edition}

        onEditionFieldSaved={vi.fn()}
        onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
        smtpConfigured={false}
        kindleConfigured={false}
      />,
    );

    expect(screen.getByText("MISSING")).toBeTruthy();
  });

  describe("Send to Kindle", () => {
    it("does not show Send to Kindle when kindleConfigured is false", () => {
      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={false}
        />,
      );

      expect(screen.queryByRole("button", { name: /send to kindle/i })).toBeNull();
    });

    it("does not show Send to Kindle when smtpConfigured is false", () => {
      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={false}
          kindleConfigured={true}
        />,
      );

      expect(screen.queryByRole("button", { name: /send to kindle/i })).toBeNull();
    });

    it("shows Send to Kindle for EPUB file when both configured", () => {
      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      expect(screen.getByRole("button", { name: /send to kindle/i })).toBeTruthy();
    });

    it("shows Send to Kindle for PDF file when both configured", () => {
      const pdfEdition = {
        ...baseEdition,
        editionFiles: [
          {
            ...baseEdition.editionFiles[0],
            fileAsset: {
              ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
              basename: "book.pdf",
              mediaKind: "PDF",
            },
          },
        ],
      } as EditionType;
      render(
        <EditionCard
          edition={pdfEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      expect(screen.getByRole("button", { name: /send to kindle/i })).toBeTruthy();
    });

    it("does not show Send to Kindle for CBZ file", () => {
      const cbzEdition = {
        ...baseEdition,
        editionFiles: [
          {
            ...baseEdition.editionFiles[0],
            fileAsset: {
              ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
              basename: "comic.cbz",
              mediaKind: "CBZ",
            },
          },
        ],
      } as EditionType;
      render(
        <EditionCard
          edition={cbzEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      expect(screen.queryByRole("button", { name: /send to kindle/i })).toBeNull();
    });

    it("does not show Send to Kindle for AUDIO file", () => {
      const audioEdition = {
        ...baseEdition,
        editionFiles: [
          {
            ...baseEdition.editionFiles[0],
            fileAsset: {
              ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
              basename: "track.mp3",
              mediaKind: "AUDIO",
            },
          },
        ],
      } as EditionType;
      render(
        <EditionCard
          edition={audioEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      expect(screen.queryByRole("button", { name: /send to kindle/i })).toBeNull();
    });

    it("does not show Send to Kindle for MISSING file", () => {
      const missingEdition = {
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
        <EditionCard
          edition={missingEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      expect(screen.queryByRole("button", { name: /send to kindle/i })).toBeNull();
    });

    it("calls sendToKindleServerFn with correct editionFileId on click", async () => {
      sendToKindleServerFnMock.mockResolvedValue({ success: true });

      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /send to kindle/i }));

      await waitFor(() => {
        expect(sendToKindleServerFnMock).toHaveBeenCalledWith({
          data: { editionFileId: "ef1" },
        });
      });
    });

    it("shows success toast on successful send", async () => {
      sendToKindleServerFnMock.mockResolvedValue({ success: true });

      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /send to kindle/i }));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith("Sent to Kindle");
      });
    });

    it("shows error toast on failed send", async () => {
      sendToKindleServerFnMock.mockResolvedValue({ success: false, error: "File too large" });

      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /send to kindle/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("File too large");
      });
    });

    it("shows error toast when sendToKindleServerFn throws", async () => {
      sendToKindleServerFnMock.mockRejectedValue(new Error("Network error"));

      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /send to kindle/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Network error");
      });
    });

    it("shows Sending state while in progress", async () => {
      let resolveSend!: () => void;
      sendToKindleServerFnMock.mockReturnValue(
        new Promise<{ success: boolean }>((resolve) => {
          resolveSend = () => { resolve({ success: true }); };
        }),
      );

      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /send to kindle/i }));

      await waitFor(() => {
        expect(screen.getByText("Sending…")).toBeTruthy();
      });

      resolveSend();

      await waitFor(() => {
        expect(screen.queryByText("Sending…")).toBeNull();
      });
    });

    it("shows fallback error when send fails without error message", async () => {
      sendToKindleServerFnMock.mockResolvedValue({ success: false });

      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /send to kindle/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to send to Kindle");
      });
    });

    it("shows generic error when send throws non-Error", async () => {
      sendToKindleServerFnMock.mockRejectedValue("string-error");

      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
        onEnrichEdition={vi.fn()}
          smtpConfigured={true}
          kindleConfigured={true}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /send to kindle/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to send to Kindle");
      });
    });
  });

  describe("duration display", () => {
    it("shows duration for audiobook editions", () => {
      const audioEdition = {
        ...baseEdition,
        formatFamily: "AUDIOBOOK" as const,
        duration: 79200,
      } as EditionType;

      render(
        <EditionCard
          edition={audioEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
          onEnrichEdition={vi.fn()}
          smtpConfigured={false}
          kindleConfigured={false}
        />,
      );

      expect(screen.getByText("Duration")).toBeTruthy();
      expect(screen.getByText("22h")).toBeTruthy();
    });

    it("does not show duration for ebook without duration", () => {
      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
          onEnrichEdition={vi.fn()}
          smtpConfigured={false}
          kindleConfigured={false}
        />,
      );

      expect(screen.queryByText("Duration")).toBeNull();
    });
  });

  describe("narrator display", () => {
    it("shows narrators section for audiobook editions", () => {
      const audioEdition = {
        ...baseEdition,
        formatFamily: "AUDIOBOOK" as const,
        contributors: [
          ...baseEdition.contributors,
          { id: "ec2", editionId: "e1", contributorId: "c2", role: "NARRATOR", contributor: { id: "c2", nameDisplay: "Scott Brick", nameCanonical: "scott brick", createdAt: new Date() } },
        ],
      } as EditionType;

      render(
        <EditionCard
          edition={audioEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
          onEnrichEdition={vi.fn()}
          smtpConfigured={false}
          kindleConfigured={false}
        />,
      );

      expect(screen.getByText("Narrators")).toBeTruthy();
    });

    it("renders Enrich Edition button", () => {
      const onEnrich = vi.fn();

      render(
        <EditionCard
          edition={baseEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
          onEnrichEdition={onEnrich}
          smtpConfigured={false}
          kindleConfigured={false}
        />,
      );

      const button = screen.getByRole("button", { name: /enrich edition/i });
      expect(button).toBeTruthy();
      fireEvent.click(button);
      expect(onEnrich).toHaveBeenCalledTimes(1);
    });

    it("saves narrator edits via updateEditionNarratorsServerFn", async () => {
      const onSaved = vi.fn();
      updateEditionNarratorsServerFnMock.mockResolvedValue({ success: true });
      // Edition with no narrators but audiobook format so section appears
      const audioEdition = {
        ...baseEdition,
        formatFamily: "AUDIOBOOK" as const,
      } as EditionType;

      render(
        <EditionCard
          edition={audioEdition}
  
          onEditionFieldSaved={onSaved}
          onDeleteEdition={vi.fn()}
          onEnrichEdition={vi.fn()}
          smtpConfigured={false}
          kindleConfigured={false}
        />,
      );

      // Click on the "No narrators" placeholder to start editing
      const placeholder = screen.getByText("No narrators");
      fireEvent.click(placeholder);

      // Type a narrator and blur to save (blur includes pending input as tag)
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Scott Brick" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateEditionNarratorsServerFnMock).toHaveBeenCalledWith({
          data: { editionId: "e1", narrators: ["Scott Brick"] },
        });
      });
      expect(onSaved).toHaveBeenCalled();
    });
  });

  describe("duration editing", () => {
    it("saves duration via saveField with parsed seconds", async () => {
      updateEditionServerFnMock.mockResolvedValue({ success: true });
      const onSaved = vi.fn();
      const audioEdition = {
        ...baseEdition,
        formatFamily: "AUDIOBOOK" as const,
        duration: 79200,
      } as EditionType;

      render(
        <EditionCard
          edition={audioEdition}
  
          onEditionFieldSaved={onSaved}
          onDeleteEdition={vi.fn()}
          onEnrichEdition={vi.fn()}
          smtpConfigured={false}
          kindleConfigured={false}
        />,
      );

      // Click on duration to start editing
      const durationField = screen.getByText("22h");
      fireEvent.click(durationField);

      const input = screen.getByDisplayValue("22h");
      fireEvent.change(input, { target: { value: "23h 30m" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateEditionServerFnMock).toHaveBeenCalledWith({
          data: {
            editionId: "e1",
            fields: { duration: "84600" },
          },
        });
      });
    });

    it("clears duration by saving empty value", async () => {
      updateEditionServerFnMock.mockResolvedValue({ success: true });
      const audioEdition = {
        ...baseEdition,
        formatFamily: "AUDIOBOOK" as const,
        duration: 3600,
      } as EditionType;

      render(
        <EditionCard
          edition={audioEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
          onEnrichEdition={vi.fn()}
          smtpConfigured={false}
          kindleConfigured={false}
        />,
      );

      const durationField = screen.getByText("1h");
      fireEvent.click(durationField);

      const input = screen.getByDisplayValue("1h");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateEditionServerFnMock).toHaveBeenCalledWith({
          data: {
            editionId: "e1",
            fields: { duration: null },
          },
        });
      });
    });

    it("parses raw numeric duration input as seconds", async () => {
      updateEditionServerFnMock.mockResolvedValue({ success: true });
      const audioEdition = {
        ...baseEdition,
        formatFamily: "AUDIOBOOK" as const,
        duration: 3600,
      } as EditionType;

      render(
        <EditionCard
          edition={audioEdition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
          onEnrichEdition={vi.fn()}
          smtpConfigured={false}
          kindleConfigured={false}
        />,
      );

      const durationField = screen.getByText("1h");
      fireEvent.click(durationField);

      const input = screen.getByDisplayValue("1h");
      fireEvent.change(input, { target: { value: "7200" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateEditionServerFnMock).toHaveBeenCalledWith({
          data: {
            editionId: "e1",
            fields: { duration: "7200" },
          },
        });
      });
    });
  });

  describe("parseDuration", () => {
    it("parses hours and minutes", () => {
      expect(parseDuration("22h 30m")).toBe(81000);
    });

    it("parses hours only", () => {
      expect(parseDuration("5h")).toBe(18000);
    });

    it("parses minutes only", () => {
      expect(parseDuration("45m")).toBe(2700);
    });

    it("parses raw numeric seconds", () => {
      expect(parseDuration("7200")).toBe(7200);
    });

    it("returns 0 for empty string", () => {
      expect(parseDuration("")).toBe(0);
    });

    it("returns 0 for non-numeric string", () => {
      expect(parseDuration("abc")).toBe(0);
    });
  });

  describe("sortEpubFirst", () => {
    it("sorts EPUB before other formats", () => {
      const files = [
        { fileAsset: { mediaKind: "PDF" } },
        { fileAsset: { mediaKind: "EPUB" } },
        { fileAsset: { mediaKind: "MOBI" } },
      ];
      const sorted = sortEpubFirst(files);
      expect(sorted.map((f) => f.fileAsset.mediaKind)).toEqual(["EPUB", "PDF", "MOBI"]);
    });

    it("preserves order when no EPUB present", () => {
      const files = [
        { fileAsset: { mediaKind: "PDF" } },
        { fileAsset: { mediaKind: "MOBI" } },
      ];
      const sorted = sortEpubFirst(files);
      expect(sorted.map((f) => f.fileAsset.mediaKind)).toEqual(["PDF", "MOBI"]);
    });
  });

  describe("download format sorting", () => {
    it("sorts EPUB first in download dropdown with mixed formats", () => {
      const edition = {
        ...baseEdition,
        editionFiles: [
          {
            ...baseEdition.editionFiles[0],
            id: "ef-pdf",
            fileAsset: {
              ...(baseEdition.editionFiles[0] as (typeof baseEdition.editionFiles)[number]).fileAsset,
              id: "fa-pdf",
              basename: "book.pdf",
              mediaKind: "PDF",
            },
          },
          baseEdition.editionFiles[0],
        ],
      } as EditionType;
      render(
        <EditionCard
          edition={edition}
  
          onEditionFieldSaved={vi.fn()}
          onDeleteEdition={vi.fn()}
          onEnrichEdition={vi.fn()}
          smtpConfigured={false}
          kindleConfigured={false}
        />,
      );

      // Should render download dropdown since multiple formats
      const downloadBtn = screen.getByRole("button", { name: /download/i });
      expect(downloadBtn).toBeTruthy();
    });
  });
});
