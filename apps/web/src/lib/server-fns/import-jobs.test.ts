import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const findManyMock = vi.fn();
const countMock = vi.fn();
const findUniqueMock = vi.fn();
const updateManyMock = vi.fn();
const workCountMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: {
    importJob: {
      findMany: findManyMock,
      count: countMock,
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
    work: {
      count: workCountMock,
    },
  },
}));

class MockNotFoundError extends Error {
  constructor(
    message: string,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "NotFoundError";
  }
}

const obliterateLibraryQueueMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@bookhouse/shared", () => ({
  NotFoundError: MockNotFoundError,
  obliterateLibraryQueue: (...args: unknown[]): unknown => obliterateLibraryQueueMock(...args),
}));

import {
  getImportJobsServerFn,
  getImportJobDetailServerFn,
  getActiveJobCountServerFn,
  stopAllJobsServerFn,
} from "./import-jobs";

describe("getImportJobsServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    countMock.mockReset();
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
  });

  it("returns jobs, totalCount, page, and pageSize", async () => {
    const fakeJobs = [{ id: "job-1" }];
    findManyMock.mockResolvedValue(fakeJobs);
    countMock.mockResolvedValue(42);

    const result = await getImportJobsServerFn({
      data: { page: 1, pageSize: 20 },
    });

    expect(result).toEqual({
      jobs: fakeJobs,
      totalCount: 42,
      page: 1,
      pageSize: 20,
    });
  });

  it("calls findMany with status filter when status is provided (non-empty array)", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, status: ["QUEUED", "RUNNING"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["QUEUED", "RUNNING"] },
        }) as unknown,
      }),
    );
  });

  it("calls findMany WITHOUT status filter when status is not provided", async () => {
    await getImportJobsServerFn({ data: { page: 1, pageSize: 20 } });

    const callArgs: unknown = findManyMock.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty("where");
    expect((callArgs as Record<string, unknown>).where).not.toHaveProperty("status");
  });

  it("calls findMany WITHOUT status filter when status is an empty array", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, status: [] },
    });

    const callArgs: unknown = findManyMock.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty("where");
    expect((callArgs as Record<string, unknown>).where).not.toHaveProperty("status");
  });

  it("calls findMany with kind filter when kind is provided", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, kind: ["SCAN_ROOT", "HASH_FILE"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: { in: ["SCAN_ROOT", "HASH_FILE"] },
        }) as unknown,
      }),
    );
  });

  it("calls findMany WITHOUT kind filter when kind is an empty array", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, kind: [] },
    });

    const callArgs: unknown = findManyMock.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty("where");
    expect((callArgs as Record<string, unknown>).where).not.toHaveProperty("kind");
  });

  it("calls findMany with libraryRootId filter when provided", async () => {
    await getImportJobsServerFn({
      data: { page: 1, pageSize: 20, libraryRootId: "root-abc" },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ libraryRootId: "root-abc" }) as unknown,
      }),
    );
  });

  it("calls findMany WITHOUT libraryRootId filter when not provided", async () => {
    await getImportJobsServerFn({ data: { page: 1, pageSize: 20 } });

    const callArgs: unknown = findManyMock.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty("where");
    expect((callArgs as Record<string, unknown>).where).not.toHaveProperty("libraryRootId");
  });

  it("uses correct skip/take for pagination (page 2, pageSize 10 → skip: 10, take: 10)", async () => {
    await getImportJobsServerFn({ data: { page: 2, pageSize: 10 } });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }) as unknown,
    );
  });
});

describe("getImportJobDetailServerFn", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it("returns job when found", async () => {
    const fakeJob = { id: "job-1", kind: "SCAN_ROOT", status: "QUEUED" };
    findUniqueMock.mockResolvedValue(fakeJob);

    const result = await getImportJobDetailServerFn({ data: { id: "job-1" } });
    expect(result).toBe(fakeJob);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "job-1" },
      include: {
        libraryRoot: { select: { id: true, name: true, path: true } },
      },
    });
  });

  it("throws NotFoundError when job is null", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      getImportJobDetailServerFn({ data: { id: "missing-id" } }),
    ).rejects.toThrow("Import job not found");
  });
});

describe("getActiveJobCountServerFn", () => {
  beforeEach(() => {
    countMock.mockReset();
    workCountMock.mockReset();
  });

  it("calls db.importJob.count with QUEUED and RUNNING status filter", async () => {
    countMock.mockResolvedValue(3);
    workCountMock.mockResolvedValue(0);
    await getActiveJobCountServerFn();
    expect(countMock).toHaveBeenCalledWith({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
    });
  });

  it("returns count of active import jobs only", async () => {
    countMock.mockResolvedValue(3);
    const result = await getActiveJobCountServerFn();
    expect(result).toBe(3);
  });

  it("returns 0 when no active jobs", async () => {
    countMock.mockResolvedValue(0);
    const result = await getActiveJobCountServerFn();
    expect(result).toBe(0);
  });
});

describe("stopAllJobsServerFn", () => {
  beforeEach(() => {
    obliterateLibraryQueueMock.mockClear();
    updateManyMock.mockReset();
  });

  it("obliterates queue and marks active jobs as FAILED", async () => {
    updateManyMock.mockResolvedValue({ count: 5 });

    const result = await stopAllJobsServerFn({} as never);

    expect(obliterateLibraryQueueMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "FAILED", error: "Stopped by user", finishedAt: expect.any(Date) as unknown },
    });
    expect(result).toEqual({ stoppedCount: 5 });
  });
});
