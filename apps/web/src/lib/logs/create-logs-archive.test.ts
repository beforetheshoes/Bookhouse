import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const { appendMock, pipeMock, finalizeMock, onMock, ZipArchiveMock } = vi.hoisted(() => {
  const appendMock = vi.fn();
  const pipeMock = vi.fn();
  const finalizeMock = vi.fn(() => Promise.resolve());
  const onMock = vi.fn();
  return {
    appendMock,
    pipeMock,
    finalizeMock,
    onMock,
    ZipArchiveMock: class {
      append = appendMock;
      pipe = pipeMock;
      finalize = finalizeMock;
      on = onMock;
    },
  };
});
vi.mock("archiver", () => ({ ZipArchive: ZipArchiveMock }));

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

  it("ends the output with an error when the archiver fails", async () => {
    const readdir = vi.fn().mockResolvedValue(["web.log"]);
    const createReadStream = vi.fn((p: string) => Readable.from([p]));
    finalizeMock.mockImplementationOnce(() => Promise.reject(new Error("zip failed")));

    const output = await createLogsArchive({ logDir: "/logs", readdir, createReadStream });
    const errorListener = onMock.mock.calls.find((call) => call[0] === "error")?.[1] as (error: Error) => void;
    const failure = new Error("read failed");
    const errored = new Promise<Error>((resolve) => output.on("error", resolve));
    errorListener(failure);

    await expect(errored).resolves.toBe(failure);
  });
});
