import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import {
  createLogsDownloadHandler,
  type LogsDownloadHandlerDeps,
} from "./download";

function createMockDeps(
  overrides: Partial<LogsDownloadHandlerDeps> = {},
): LogsDownloadHandlerDeps {
  return {
    createArchive: vi
      .fn()
      .mockResolvedValue(
        Readable.from(Buffer.from("zip")),
      ) as LogsDownloadHandlerDeps["createArchive"],
    setResponseHeader: vi.fn(),
    sendStream: vi.fn<LogsDownloadHandlerDeps["sendStream"]>(
      (_event, stream) => stream,
    ),
    requireOwner: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("logs download handler", () => {
  it("requires the owner before building the archive", async () => {
    const error = new Error("forbidden");
    const createArchive = vi.fn();
    const deps = createMockDeps({
      requireOwner: vi.fn(() => {
        throw error;
      }),
      createArchive: createArchive as LogsDownloadHandlerDeps["createArchive"],
    });

    await expect(
      createLogsDownloadHandler(deps)({} as never),
    ).rejects.toThrow("forbidden");
    expect(createArchive).not.toHaveBeenCalled();
  });

  it("builds the archive and streams it as a zip attachment", async () => {
    const deps = createMockDeps();
    const handler = createLogsDownloadHandler(deps);

    const result = await handler({} as never);

    expect(deps.requireOwner).toHaveBeenCalled();
    expect(deps.createArchive).toHaveBeenCalled();
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/zip",
    );
    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Disposition",
      `attachment; filename="bookhouse-logs.zip"`,
    );
    expect(deps.sendStream).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Readable);
  });
});
