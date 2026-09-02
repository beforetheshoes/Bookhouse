import { beforeEach, describe, expect, it, vi } from "vitest";

const updateManyMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    importJob: {
      updateMany: updateManyMock,
      findUnique: findUniqueMock,
    },
  },
}));

beforeEach(() => {
  updateManyMock.mockReset();
  updateManyMock.mockResolvedValue({ count: 1 });
  findUniqueMock.mockReset();
});

describe("recordBatchJobProgress", () => {
  it("increments processedFiles on a live batch and sets startedAt only when unset", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: 10, processedFiles: 1 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-1", false);

    expect(updateManyMock).toHaveBeenNthCalledWith(1, {
      where: { id: "ij-1", status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "RUNNING", processedFiles: { increment: 1 } },
    });
    expect(updateManyMock).toHaveBeenNthCalledWith(2, {
      where: { id: "ij-1", startedAt: null },
      data: { startedAt: expect.any(Date) as Date },
    });
    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });

  it("increments errorCount alongside processedFiles when isError is true", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: 10, processedFiles: 1 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-2", true);

    expect(updateManyMock).toHaveBeenNthCalledWith(1, {
      where: { id: "ij-2", status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "RUNNING", processedFiles: { increment: 1 }, errorCount: { increment: 1 } },
    });
  });

  it("marks SUCCEEDED when processedFiles reaches totalFiles", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: 5, processedFiles: 5 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-3", false);

    expect(updateManyMock).toHaveBeenCalledTimes(3);
    expect(updateManyMock).toHaveBeenLastCalledWith({
      where: { id: "ij-3", status: "RUNNING" },
      data: { status: "SUCCEEDED", finishedAt: expect.any(Date) as Date },
    });
  });

  it("does not mark SUCCEEDED when processedFiles is below totalFiles", async () => {
    findUniqueMock.mockResolvedValue({ totalFiles: 5, processedFiles: 3 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-4", false);

    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });

  it("does not mark SUCCEEDED when the ImportJob row vanished after the increment", async () => {
    findUniqueMock.mockResolvedValue(null);
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-5", false);

    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });

  it("leaves a stopped, failed, finished or deleted batch untouched", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });
    const { recordBatchJobProgress } = await import("./import-job-progress");

    await recordBatchJobProgress("ij-stopped", true);

    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});
