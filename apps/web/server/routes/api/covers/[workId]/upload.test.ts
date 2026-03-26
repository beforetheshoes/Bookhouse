import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUploadHandler, type UploadHandlerDeps } from "./upload";

function createMockDeps(overrides: Partial<UploadHandlerDeps> = {}): UploadHandlerDeps {
  return {
    coverCacheDir: "/data/covers",
    readFormData: vi.fn().mockResolvedValue([
      { name: "file", data: Buffer.from("fake-image"), type: "image/jpeg" },
    ]),
    resizeAndSave: vi.fn().mockResolvedValue(undefined),
    db: {
      findWork: vi.fn().mockResolvedValue({ editedFields: [] }),
      updateWork: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function createMockEvent(workId: string) {
  return {
    context: { params: { workId } },
  };
}

describe("cover upload handler", () => {
  let deps: UploadHandlerDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it("processes upload and updates work", async () => {
    const handler = createUploadHandler(deps);
    const result = await handler(createMockEvent("work-1") as never);

    expect(deps.resizeAndSave).toHaveBeenCalledWith(
      expect.any(Buffer) as Buffer,
      "/data/covers/work-1",
    );
    expect(deps.db.updateWork).toHaveBeenCalledWith("work-1", {
      coverPath: "work-1",
      editedFields: ["coverPath"],
    });
    expect(result).toEqual({ success: true });
  });

  it("merges editedFields with existing values", async () => {
    deps = createMockDeps({
      db: {
        findWork: vi.fn().mockResolvedValue({ editedFields: ["description"] }),
        updateWork: vi.fn().mockResolvedValue(undefined),
      },
    });
    const handler = createUploadHandler(deps);
    await handler(createMockEvent("work-1") as never);

    expect(deps.db.updateWork).toHaveBeenCalledWith("work-1", {
      coverPath: "work-1",
      editedFields: ["description", "coverPath"],
    });
  });

  it("throws 400 for invalid workId", async () => {
    const handler = createUploadHandler(deps);
    await expect(handler(createMockEvent("../etc/passwd") as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws 400 when no file is uploaded", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([]),
    });
    const handler = createUploadHandler(deps);
    await expect(handler(createMockEvent("work-1") as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "No file uploaded",
    });
  });

  it("throws 400 when form data is undefined", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue(undefined),
    });
    const handler = createUploadHandler(deps);
    await expect(handler(createMockEvent("work-1") as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "No file uploaded",
    });
  });

  it("throws 400 when file is empty", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: Buffer.alloc(0), type: "image/jpeg" },
      ]),
    });
    const handler = createUploadHandler(deps);
    await expect(handler(createMockEvent("work-1") as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "No file uploaded",
    });
  });

  it("throws 400 when file exceeds size limit", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: Buffer.alloc(11 * 1024 * 1024), type: "image/jpeg" },
      ]),
    });
    const handler = createUploadHandler(deps);
    await expect(handler(createMockEvent("work-1") as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "File too large (max 10 MB)",
    });
  });

  it("throws 400 for invalid MIME type", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: Buffer.from("data"), type: "application/pdf" },
      ]),
    });
    const handler = createUploadHandler(deps);
    await expect(handler(createMockEvent("work-1") as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Invalid image type",
    });
  });

  it("allows upload without MIME type", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: Buffer.from("data") },
      ]),
    });
    const handler = createUploadHandler(deps);
    const result = await handler(createMockEvent("work-1") as never);
    expect(result).toEqual({ success: true });
  });

  it("throws 404 when work is not found", async () => {
    deps = createMockDeps({
      db: {
        findWork: vi.fn().mockResolvedValue(null),
        updateWork: vi.fn(),
      },
    });
    const handler = createUploadHandler(deps);
    await expect(handler(createMockEvent("work-1") as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Work not found",
    });
  });
});
