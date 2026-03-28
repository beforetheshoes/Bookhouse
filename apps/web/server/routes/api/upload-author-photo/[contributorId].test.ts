import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthorPhotoUploadHandler, type AuthorPhotoUploadDeps } from "./[contributorId]";

const VALID_JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);

function createMockDeps(overrides: Partial<AuthorPhotoUploadDeps> = {}): AuthorPhotoUploadDeps {
  return {
    coverCacheDir: "/data/covers",
    readFormData: vi.fn().mockResolvedValue([
      { name: "file", data: VALID_JPEG, type: "image/jpeg" },
    ]),
    resizeAndSave: vi.fn().mockResolvedValue(undefined),
    db: {
      findContributor: vi.fn().mockResolvedValue({ id: "c1" }),
      updateContributor: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function createMockEvent(contributorId: string) {
  return {
    context: { params: { contributorId } },
  };
}

describe("author photo upload handler", () => {
  let deps: AuthorPhotoUploadDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it("processes upload and updates contributor", async () => {
    const handler = createAuthorPhotoUploadHandler(deps);
    const result = await handler(createMockEvent("c1") as never);

    expect(deps.resizeAndSave).toHaveBeenCalledWith(
      expect.any(Buffer) as Buffer,
      "/data/covers/authors/c1",
    );
    expect(deps.db.updateContributor).toHaveBeenCalledWith("c1", { imagePath: "c1" });
    expect(result).toEqual({ success: true });
  });

  it("throws 400 for invalid contributorId", async () => {
    const handler = createAuthorPhotoUploadHandler(deps);
    await expect(handler(createMockEvent("../etc/passwd") as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws 400 when no file is uploaded", async () => {
    deps = createMockDeps({ readFormData: vi.fn().mockResolvedValue([]) });
    const handler = createAuthorPhotoUploadHandler(deps);
    await expect(handler(createMockEvent("c1") as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "No file uploaded",
    });
  });

  it("throws 400 when file is too large", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: Buffer.alloc(11 * 1024 * 1024), type: "image/jpeg" },
      ]),
    });
    const handler = createAuthorPhotoUploadHandler(deps);
    await expect(handler(createMockEvent("c1") as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "File too large (max 10 MB)",
    });
  });

  it("throws 400 for invalid MIME type", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: VALID_JPEG, type: "application/pdf" },
      ]),
    });
    const handler = createAuthorPhotoUploadHandler(deps);
    await expect(handler(createMockEvent("c1") as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Invalid image type",
    });
  });

  it("throws 400 for invalid magic bytes", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: Buffer.from("not an image"), type: "image/jpeg" },
      ]),
    });
    const handler = createAuthorPhotoUploadHandler(deps);
    await expect(handler(createMockEvent("c1") as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "File is not a valid image",
    });
  });

  it("throws 404 when contributor not found", async () => {
    deps = createMockDeps({
      db: {
        findContributor: vi.fn().mockResolvedValue(null),
        updateContributor: vi.fn(),
      },
    });
    const handler = createAuthorPhotoUploadHandler(deps);
    await expect(handler(createMockEvent("c1") as never)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("allows missing MIME type if magic bytes are valid", async () => {
    deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: VALID_JPEG },
      ]),
    });
    const handler = createAuthorPhotoUploadHandler(deps);
    const result = await handler(createMockEvent("c1") as never);
    expect(result).toEqual({ success: true });
  });
});
