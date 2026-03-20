// @vitest-environment happy-dom
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const triggerEnrichmentMock = vi.fn();
const getEnrichmentDataMock = vi.fn();
const applyEnrichmentMock = vi.fn();

vi.mock("~/lib/server-fns/enrichment", () => ({
  triggerEnrichmentServerFn: (...args: unknown[]): unknown => triggerEnrichmentMock(...args),
  getEnrichmentDataServerFn: (...args: unknown[]): unknown => getEnrichmentDataMock(...args),
  applyEnrichmentServerFn: (...args: unknown[]): unknown => applyEnrichmentMock(...args),
}));

import { EnrichmentReview } from "./enrichment-review";

beforeEach(() => {
  triggerEnrichmentMock.mockReset();
  getEnrichmentDataMock.mockReset();
  applyEnrichmentMock.mockReset();
});

describe("EnrichmentReview", () => {
  it("renders the enrich metadata button", () => {
    render(<EnrichmentReview workId="w1" currentDescription={null} />);
    expect(screen.getByRole("button", { name: "Enrich Metadata" })).toBeTruthy();
  });

  it("triggers enrichment and shows loading state", async () => {
    triggerEnrichmentMock.mockResolvedValue({ importJobId: "ij1", queueJobId: "q1" });
    getEnrichmentDataMock.mockResolvedValue({
      externalLinks: [
        {
          id: "el1",
          provider: "openlibrary",
          externalId: "OL123W",
          metadata: { title: "The Hobbit", description: "Adventure story", coverIds: [42], subjects: ["Fantasy"] },
          lastSyncedAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    });

    const user = userEvent.setup();
    render(<EnrichmentReview workId="w1" currentDescription={null} />);

    await user.click(screen.getByRole("button", { name: "Enrich Metadata" }));

    expect(triggerEnrichmentMock).toHaveBeenCalledWith({ data: { workId: "w1" } });
  });

  it("shows enrichment data after triggering", async () => {
    triggerEnrichmentMock.mockResolvedValue({ importJobId: "ij1", queueJobId: "q1" });
    getEnrichmentDataMock.mockResolvedValue({
      externalLinks: [
        {
          id: "el1",
          provider: "openlibrary",
          externalId: "OL123W",
          metadata: { title: "The Hobbit", description: "Adventure story", coverIds: [42], subjects: ["Fantasy"] },
          lastSyncedAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    });

    const user = userEvent.setup();
    render(<EnrichmentReview workId="w1" currentDescription="Old desc" />);

    await user.click(screen.getByRole("button", { name: "Enrich Metadata" }));

    // Wait for enrichment data to load
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByText("Adventure story")).toBeTruthy();
    expect(screen.getByText("openlibrary")).toBeTruthy();
  });

  it("shows no enrichment data message when empty", async () => {
    triggerEnrichmentMock.mockResolvedValue({ importJobId: "ij1", queueJobId: "q1" });
    getEnrichmentDataMock.mockResolvedValue({ externalLinks: [] });

    const user = userEvent.setup();
    render(<EnrichmentReview workId="w1" currentDescription={null} />);

    await user.click(screen.getByRole("button", { name: "Enrich Metadata" }));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByText("No enrichment data found")).toBeTruthy();
  });

  it("applies selected description", async () => {
    triggerEnrichmentMock.mockResolvedValue({ importJobId: "ij1", queueJobId: "q1" });
    getEnrichmentDataMock.mockResolvedValue({
      externalLinks: [
        {
          id: "el1",
          provider: "openlibrary",
          externalId: "OL123W",
          metadata: { description: "New desc" },
          lastSyncedAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    });
    applyEnrichmentMock.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    render(<EnrichmentReview workId="w1" currentDescription="Old desc" />);

    await user.click(screen.getByRole("button", { name: "Enrich Metadata" }));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Click Apply
    await user.click(screen.getByRole("button", { name: "Apply Description" }));

    expect(applyEnrichmentMock).toHaveBeenCalledWith({
      data: { workId: "w1", fields: { description: "New desc" } },
    });
  });

  it("shows applied confirmation", async () => {
    triggerEnrichmentMock.mockResolvedValue({ importJobId: "ij1", queueJobId: "q1" });
    getEnrichmentDataMock.mockResolvedValue({
      externalLinks: [
        {
          id: "el1",
          provider: "openlibrary",
          externalId: "OL123W",
          metadata: { description: "New desc" },
          lastSyncedAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    });
    applyEnrichmentMock.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    render(<EnrichmentReview workId="w1" currentDescription={null} />);

    await user.click(screen.getByRole("button", { name: "Enrich Metadata" }));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await user.click(screen.getByRole("button", { name: "Apply Description" }));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByText("Applied successfully")).toBeTruthy();
  });

  it("does not show apply button when no description in metadata", async () => {
    triggerEnrichmentMock.mockResolvedValue({ importJobId: "ij1", queueJobId: "q1" });
    getEnrichmentDataMock.mockResolvedValue({
      externalLinks: [
        {
          id: "el1",
          provider: "openlibrary",
          externalId: "OL123W",
          metadata: { title: "Some Title" },
          lastSyncedAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    });

    const user = userEvent.setup();
    render(<EnrichmentReview workId="w1" currentDescription={null} />);

    await user.click(screen.getByRole("button", { name: "Enrich Metadata" }));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.queryByRole("button", { name: "Apply Description" })).toBeNull();
  });
});
