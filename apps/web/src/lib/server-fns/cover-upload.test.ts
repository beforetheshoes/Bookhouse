import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: (schema: unknown) => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const workFindUniqueMock = vi.fn();
const workUpdateMock = vi.fn();
const resizeCoverImageMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: {
      findUnique: workFindUniqueMock,
      update: workUpdateMock,
    },
  },
}));

vi.mock("@bookhouse/ingest", () => ({
  resizeCoverImage: (...args: unknown[]): unknown => resizeCoverImageMock(...args),
}));

vi.mock("sharp", () => ({
  default: vi.fn(),
}));

import { uploadCoverServerFn } from "./cover-upload";

beforeEach(() => {
  workFindUniqueMock.mockReset();
  workUpdateMock.mockReset();
  resizeCoverImageMock.mockReset();
});

describe("uploadCoverServerFn", () => {
  const validBase64 = Buffer.from("fake-image-data").toString("base64");

  it("processes the image and updates work coverPath", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    resizeCoverImageMock.mockResolvedValue({ thumbPath: "/covers/w1/thumb.webp", mediumPath: "/covers/w1/medium.webp" });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    const result = await uploadCoverServerFn({
      data: { workId: "w1", imageBase64: validBase64 },
    });

    expect(resizeCoverImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        imageBuffer: expect.any(Buffer) as Buffer,
      }),
      expect.any(Object) as Record<string, unknown>,
    );
    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: {
        coverPath: "w1",
        editedFields: ["coverPath"],
      },
    });
    expect(result).toEqual({ success: true });
  });

  it("merges editedFields with existing values", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: ["description"] });
    resizeCoverImageMock.mockResolvedValue({ thumbPath: "/t", mediumPath: "/m" });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await uploadCoverServerFn({
      data: { workId: "w1", imageBase64: validBase64 },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: {
        coverPath: "w1",
        editedFields: ["description", "coverPath"],
      },
    });
  });

  it("handles work not found for editedFields gracefully", async () => {
    workFindUniqueMock.mockResolvedValue(null);
    resizeCoverImageMock.mockResolvedValue({ thumbPath: "/t", mediumPath: "/m" });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await uploadCoverServerFn({
      data: { workId: "w1", imageBase64: validBase64 },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: {
        coverPath: "w1",
        editedFields: ["coverPath"],
      },
    });
  });

  it("throws on empty base64 data", async () => {
    await expect(
      uploadCoverServerFn({
        data: { workId: "w1", imageBase64: "" },
      }),
    ).rejects.toThrow("No image data provided");
  });
});
