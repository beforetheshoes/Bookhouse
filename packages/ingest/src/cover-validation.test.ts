import { describe, it, expect } from "vitest";
import {
  VALID_WORK_ID,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  IMAGE_SIGNATURES,
  isValidImageData,
  isAllowedMimeType,
} from "./cover-validation";

describe("cover-validation", () => {
  describe("VALID_WORK_ID", () => {
    it("accepts alphanumeric with dashes and underscores", () => {
      expect(VALID_WORK_ID.test("work-1")).toBe(true);
      expect(VALID_WORK_ID.test("abc_DEF_123")).toBe(true);
    });

    it("rejects path traversal", () => {
      expect(VALID_WORK_ID.test("../etc/passwd")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(VALID_WORK_ID.test("")).toBe(false);
    });
  });

  describe("MAX_FILE_SIZE", () => {
    it("equals 10 MB", () => {
      expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
    });
  });

  describe("ALLOWED_MIME_TYPES", () => {
    it("includes jpeg, png, webp, gif", () => {
      expect(ALLOWED_MIME_TYPES.has("image/jpeg")).toBe(true);
      expect(ALLOWED_MIME_TYPES.has("image/png")).toBe(true);
      expect(ALLOWED_MIME_TYPES.has("image/webp")).toBe(true);
      expect(ALLOWED_MIME_TYPES.has("image/gif")).toBe(true);
    });

    it("excludes non-image types", () => {
      expect(ALLOWED_MIME_TYPES.has("application/pdf")).toBe(false);
    });
  });

  describe("IMAGE_SIGNATURES", () => {
    it("has four supported formats", () => {
      expect(IMAGE_SIGNATURES).toHaveLength(4);
      const formats = IMAGE_SIGNATURES.map(([, name]) => name);
      expect(formats).toEqual(["JPEG", "PNG", "WebP", "GIF"]);
    });
  });

  describe("isValidImageData", () => {
    it("recognizes JPEG magic bytes", () => {
      expect(isValidImageData(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    });

    it("recognizes PNG magic bytes", () => {
      expect(isValidImageData(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    });

    it("recognizes WebP magic bytes", () => {
      expect(isValidImageData(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(true);
    });

    it("recognizes GIF magic bytes", () => {
      expect(isValidImageData(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe(true);
    });

    it("rejects unknown magic bytes", () => {
      expect(isValidImageData(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBe(false);
    });

    it("rejects data shorter than 4 bytes", () => {
      expect(isValidImageData(new Uint8Array([0xff, 0xd8]))).toBe(false);
    });
  });

  describe("isAllowedMimeType", () => {
    it("allows null (missing MIME type)", () => {
      expect(isAllowedMimeType(null)).toBe(true);
    });

    it("allows undefined (missing MIME type)", () => {
      expect(isAllowedMimeType(undefined)).toBe(true);
    });

    it("allows image/jpeg", () => {
      expect(isAllowedMimeType("image/jpeg")).toBe(true);
    });

    it("rejects application/pdf", () => {
      expect(isAllowedMimeType("application/pdf")).toBe(false);
    });
  });
});
