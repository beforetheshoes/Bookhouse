import { beforeEach, describe, expect, it, vi } from "vitest";

const pinoFn = vi.fn();
const multistreamMock = vi.fn();
vi.mock("pino", () => ({
  default: Object.assign(pinoFn, { multistream: multistreamMock }),
}));

const createWriteStreamMock = vi.fn();
const existsSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const renameSyncMock = vi.fn();
const statSyncMock = vi.fn();
vi.mock("node:fs", () => ({
  createWriteStream: createWriteStreamMock,
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  renameSync: renameSyncMock,
  statSync: statSyncMock,
}));

async function freshCreateLogger() {
  vi.resetModules();
  return (await import("./logger")).createLogger;
}

describe("createLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pinoFn.mockReturnValue({ info: vi.fn() });
    multistreamMock.mockReturnValue("MULTISTREAM");
    createWriteStreamMock.mockReturnValue("WRITESTREAM");
    existsSyncMock.mockReturnValue(false);
    statSyncMock.mockReturnValue({ size: 0 });
    delete process.env.LOG_DIR;
    delete process.env.LOG_SERVICE;
    delete process.env.LOG_LEVEL;
  });

  it("logs to stdout only when LOG_DIR is unset", async () => {
    const createLogger = await freshCreateLogger();
    createLogger("web");
    expect(pinoFn).toHaveBeenCalledWith({ name: "web", level: "info" });
    expect(multistreamMock).not.toHaveBeenCalled();
  });

  it("honours LOG_LEVEL", async () => {
    process.env.LOG_LEVEL = "debug";
    const createLogger = await freshCreateLogger();
    createLogger("web");
    expect(pinoFn).toHaveBeenCalledWith({ name: "web", level: "debug" });
  });

  it("treats an empty LOG_DIR as unset", async () => {
    process.env.LOG_DIR = "";
    const createLogger = await freshCreateLogger();
    createLogger("web");
    expect(multistreamMock).not.toHaveBeenCalled();
  });

  it("writes to a file and stdout when LOG_DIR is set", async () => {
    process.env.LOG_DIR = "/data/logs";
    process.env.LOG_SERVICE = "worker";
    const createLogger = await freshCreateLogger();
    createLogger("ingest");
    expect(mkdirSyncMock).toHaveBeenCalledWith("/data/logs", { recursive: true });
    expect(createWriteStreamMock).toHaveBeenCalledWith("/data/logs/worker.log", {
      flags: "a",
    });
    expect(multistreamMock).toHaveBeenCalledWith([
      { stream: process.stdout },
      { stream: "WRITESTREAM" },
    ]);
    expect(pinoFn).toHaveBeenCalledWith(
      { name: "ingest", level: "info" },
      "MULTISTREAM",
    );
  });

  it("defaults the file name to app.log when LOG_SERVICE is unset", async () => {
    process.env.LOG_DIR = "/data/logs";
    const createLogger = await freshCreateLogger();
    createLogger("web");
    expect(createWriteStreamMock).toHaveBeenCalledWith("/data/logs/app.log", {
      flags: "a",
    });
  });

  it("rotates the file once it exceeds the size cap", async () => {
    process.env.LOG_DIR = "/data/logs";
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ size: 26 * 1024 * 1024 });
    const createLogger = await freshCreateLogger();
    createLogger("web");
    expect(renameSyncMock).toHaveBeenCalledWith(
      "/data/logs/app.log",
      "/data/logs/app.log.1",
    );
  });

  it("does not rotate when the file is under the cap", async () => {
    process.env.LOG_DIR = "/data/logs";
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ size: 10 });
    const createLogger = await freshCreateLogger();
    createLogger("web");
    expect(renameSyncMock).not.toHaveBeenCalled();
  });

  it("opens the file once and reuses it across loggers", async () => {
    process.env.LOG_DIR = "/data/logs";
    const createLogger = await freshCreateLogger();
    createLogger("web");
    createLogger("ingest");
    expect(mkdirSyncMock).toHaveBeenCalledTimes(1);
    expect(createWriteStreamMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to stdout-only when the file can't be opened", async () => {
    process.env.LOG_DIR = "/data/logs";
    mkdirSyncMock.mockImplementation(() => {
      throw new Error("EACCES");
    });
    const createLogger = await freshCreateLogger();
    createLogger("web");
    expect(multistreamMock).not.toHaveBeenCalled();
    expect(pinoFn).toHaveBeenCalledWith({ name: "web", level: "info" });
  });
});
