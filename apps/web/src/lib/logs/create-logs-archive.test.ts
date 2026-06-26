import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const { appendMock, pipeMock, finalizeMock, archiverFn } = vi.hoisted(() => {
  const appendMock = vi.fn();
  const pipeMock = vi.fn();
  const finalizeMock = vi.fn();
  return {
    appendMock,
    pipeMock,
    finalizeMock,
    archiverFn: vi.fn(() => ({
      append: appendMock,
      pipe: pipeMock,
      finalize: finalizeMock,
    })),
  };
});
vi.mock("archiver", () => ({ default: archiverFn }));

import { createLogsArchive } from "./create-logs-archive";

describe("createLogsArchive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends each log file (sorted, log-only) and finalizes", async () => {
    const createReadStream = vi.fn((p: string) => Readable.from([p]));
    const readdir = vi
      .fn()
      .mockResolvedValue(["worker.log", "web.log", "web.log.1", "covers"]);

    const result = await createLogsArchive({
      logDir: "/data/logs",
      readdir,
      createReadStream,
    });

    expect(readdir).toHaveBeenCalledWith("/data/logs");
    expect(appendMock).toHaveBeenCalledTimes(3);
    expect(appendMock).toHaveBeenNthCalledWith(1, expect.anything(), {
      name: "web.log",
    });
    expect(appendMock).toHaveBeenNthCalledWith(2, expect.anything(), {
      name: "web.log.1",
    });
    expect(appendMock).toHaveBeenNthCalledWith(3, expect.anything(), {
      name: "worker.log",
    });
    expect(createReadStream).toHaveBeenCalledWith("/data/logs/web.log");
    expect(finalizeMock).toHaveBeenCalled();
    expect(pipeMock).toHaveBeenCalledWith(result);
    expect(result).toBeInstanceOf(Readable);
  });

  it("writes a README when there are no log files", async () => {
    const createReadStream = vi.fn();
    const readdir = vi.fn().mockResolvedValue(["covers", "other.txt"]);

    await createLogsArchive({
      logDir: "/data/logs",
      readdir,
      createReadStream,
    });

    expect(appendMock).toHaveBeenCalledWith("No log files found in /data/logs.", {
      name: "README.txt",
    });
    expect(createReadStream).not.toHaveBeenCalled();
    expect(finalizeMock).toHaveBeenCalled();
  });
});
