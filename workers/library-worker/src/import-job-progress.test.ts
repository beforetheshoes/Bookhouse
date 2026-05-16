import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    importJob: {
      update: updateMock,
      findUnique: findUniqueMock,
    },
  },
}));

beforeEach(() => {
  updateMock.mockReset();
  updateMock.mockResolvedValue({});
  findUniqueMock.mockReset();
});

describe("recordBatchJobProgress", () => {
  it("increments processedFiles and sets RUNNING on success", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: 10, processedFiles: 1 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-1", false);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "ij-1" },
      data: {
        status: "RUNNING",
        startedAt: expect.any(Date) as Date,
        processedFiles: { increment: 1 },
      },
    });
  });

  it("increments errorCount alongside processedFiles when isError is true", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: 10, processedFiles: 1 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-2", true);

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "ij-2" },
      data: {
        status: "RUNNING",
        startedAt: expect.any(Date) as Date,
        processedFiles: { increment: 1 },
        errorCount: { increment: 1 },
      },
    });
  });

  it("marks SUCCEEDED when processedFiles reaches totalFiles", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: 5, processedFiles: 5 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-3", false);

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenLastCalledWith({
      where: { id: "ij-3" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as Date },
    });
  });

  it("does not mark SUCCEEDED when processedFiles is below totalFiles", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: 5, processedFiles: 3 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-4", false);

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("does not mark SUCCEEDED when ImportJob is missing", async () => {
    findUniqueMock.mockResolvedValue(null);
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-5", false);

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("does not mark SUCCEEDED when totalFiles is null", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: null, processedFiles: 5 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-6", false);

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("does not mark SUCCEEDED when processedFiles is null", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: 10, processedFiles: null });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-7", false);

    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
