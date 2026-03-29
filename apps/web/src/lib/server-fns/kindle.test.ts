import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: (schema: object) => Builder;
      handler: <T extends Record<string, string | number | boolean | null | string[] | Date | undefined>>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    appSetting: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      upsert: mockUpsert,
      deleteMany: mockDeleteMany,
    },
    editionFile: {
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock("@bookhouse/auth", () => ({
  loadAuthConfig: () => ({ secret: "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d" }),
}));

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({
  sendMail: mockSendMail,
}));

vi.mock("nodemailer", () => ({
  createTransport: mockCreateTransport,
}));

const mockGetDecryptedSmtpConfig = vi.fn();
vi.mock("./smtp", () => ({
  getDecryptedSmtpConfig: mockGetDecryptedSmtpConfig,
}));

import {
  KINDLE_COMPATIBLE_MEDIA_KINDS,
  KINDLE_MAX_FILE_SIZE,
  getKindleStatusServerFn,
  getKindleConfigServerFn,
  saveKindleConfigServerFn,
  removeKindleConfigServerFn,
  sendToKindleServerFn,
} from "./kindle";

describe("kindle server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constants", () => {
    it("exports Kindle-compatible media kinds", () => {
      expect(KINDLE_COMPATIBLE_MEDIA_KINDS).toEqual(new Set(["EPUB", "PDF"]));
    });

    it("exports 50 MB max file size", () => {
      expect(KINDLE_MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    });
  });

  describe("getKindleStatusServerFn", () => {
    it("returns configured false when no kindle:email exists", async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getKindleStatusServerFn({} as never);

      expect(result).toEqual({ configured: false });
      expect(mockFindUnique).toHaveBeenCalledWith({ where: { key: "kindle:email" } });
    });

    it("returns configured true when kindle:email exists", async () => {
      mockFindUnique.mockResolvedValue({ key: "kindle:email", value: "me@kindle.com" });

      const result = await getKindleStatusServerFn({} as never);

      expect(result).toEqual({ configured: true });
    });
  });

  describe("getKindleConfigServerFn", () => {
    it("returns configured false when no setting exists", async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getKindleConfigServerFn({} as never);

      expect(result).toEqual({ configured: false });
    });

    it("returns configured true with email when setting exists", async () => {
      mockFindUnique.mockResolvedValue({ key: "kindle:email", value: "me@kindle.com" });

      const result = await getKindleConfigServerFn({} as never);

      expect(result).toEqual({ configured: true, email: "me@kindle.com" });
    });
  });

  describe("saveKindleConfigServerFn", () => {
    it("upserts the kindle:email setting", async () => {
      await saveKindleConfigServerFn({
        data: { email: "me@kindle.com" },
      });

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { key: "kindle:email" },
        create: { key: "kindle:email", value: "me@kindle.com" },
        update: { value: "me@kindle.com" },
      });
    });

    it("returns saved true", async () => {
      const result = await saveKindleConfigServerFn({
        data: { email: "me@kindle.com" },
      });

      expect(result).toEqual({ saved: true });
    });
  });

  describe("removeKindleConfigServerFn", () => {
    it("deletes the kindle:email setting", async () => {
      mockDeleteMany.mockResolvedValue({ count: 1 });

      const result = await removeKindleConfigServerFn({} as never);

      expect(result).toEqual({ removed: true });
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { key: { in: ["kindle:email"] } },
      });
    });
  });

  describe("sendToKindleServerFn", () => {
    const smtpConfig = {
      host: "mail.smtp2go.com",
      port: 587,
      username: "user@example.com",
      password: "secret123",
      fromAddress: "books@example.com",
      security: "starttls" as const,
    };

    function mockEditionFile(overrides: Record<string, string | bigint> = {}) {
      return {
        id: "ef1",
        fileAsset: {
          absolutePath: "/books/wind.epub",
          basename: "wind.epub",
          mediaKind: "EPUB",
          availabilityStatus: "PRESENT",
          sizeBytes: BigInt(2400000),
          ...overrides,
        },
      };
    }

    it("sends an EPUB file with empty subject using path attachment", async () => {
      mockFindUnique
        .mockResolvedValueOnce(mockEditionFile())
        .mockResolvedValueOnce({ key: "kindle:email", value: "me@kindle.com" });
      mockGetDecryptedSmtpConfig.mockResolvedValue(smtpConfig);
      mockSendMail.mockResolvedValue({ messageId: "abc" });

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({ success: true });
      expect(mockSendMail).toHaveBeenCalledWith({
        from: "books@example.com",
        to: "me@kindle.com",
        subject: "",
        text: "Sent via Bookhouse",
        attachments: [{ filename: "wind.epub", path: "/books/wind.epub", contentType: "application/epub+zip" }],
      });
    });

    it("sends a PDF file with CONVERT subject using path attachment", async () => {
      mockFindUnique
        .mockResolvedValueOnce(mockEditionFile({ mediaKind: "PDF", basename: "wind.pdf", absolutePath: "/books/wind.pdf" }))
        .mockResolvedValueOnce({ key: "kindle:email", value: "me@kindle.com" });
      mockGetDecryptedSmtpConfig.mockResolvedValue(smtpConfig);
      mockSendMail.mockResolvedValue({ messageId: "abc" });

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({ success: true });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "CONVERT",
          text: "Sent via Bookhouse",
          attachments: [{ filename: "wind.pdf", path: "/books/wind.pdf", contentType: "application/pdf" }],
        }),
      );
    });

    it("returns error when edition file not found", async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef-missing" },
      });

      expect(result).toEqual({ success: false, error: "File not found" });
    });

    it("returns error when file is not PRESENT", async () => {
      mockFindUnique.mockResolvedValueOnce(mockEditionFile({ availabilityStatus: "MISSING" }));

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({ success: false, error: "File is not available on disk" });
    });

    it("returns error when mediaKind is CBZ", async () => {
      mockFindUnique.mockResolvedValueOnce(mockEditionFile({ mediaKind: "CBZ" }));

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({ success: false, error: "This file format is not supported by Kindle" });
    });

    it("returns error when mediaKind is AUDIO", async () => {
      mockFindUnique.mockResolvedValueOnce(mockEditionFile({ mediaKind: "AUDIO" }));

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({ success: false, error: "This file format is not supported by Kindle" });
    });

    it("returns error when file exceeds 50 MB", async () => {
      mockFindUnique.mockResolvedValueOnce(
        mockEditionFile({ sizeBytes: BigInt(51 * 1024 * 1024) }),
      );

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({ success: false, error: "File exceeds Kindle's 50 MB limit" });
    });

    it("returns error when Kindle is not configured", async () => {
      mockFindUnique
        .mockResolvedValueOnce(mockEditionFile())
        .mockResolvedValueOnce(null);

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({
        success: false,
        error: "Kindle email is not configured. Set it up in Settings > Integrations.",
      });
    });

    it("returns error when SMTP is not configured", async () => {
      mockFindUnique
        .mockResolvedValueOnce(mockEditionFile())
        .mockResolvedValueOnce({ key: "kindle:email", value: "me@kindle.com" });
      mockGetDecryptedSmtpConfig.mockResolvedValue(null);

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({
        success: false,
        error: "SMTP is not configured. Set it up in Settings > Integrations.",
      });
    });

    it("returns error when sendMail fails", async () => {
      mockFindUnique
        .mockResolvedValueOnce(mockEditionFile())
        .mockResolvedValueOnce({ key: "kindle:email", value: "me@kindle.com" });
      mockGetDecryptedSmtpConfig.mockResolvedValue(smtpConfig);
      mockSendMail.mockRejectedValue(new Error("Rejected by server"));

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({ success: false, error: "Rejected by server" });
    });

    it("returns Unknown error for non-Error exceptions", async () => {
      mockFindUnique
        .mockResolvedValueOnce(mockEditionFile())
        .mockResolvedValueOnce({ key: "kindle:email", value: "me@kindle.com" });
      mockGetDecryptedSmtpConfig.mockResolvedValue(smtpConfig);
      mockSendMail.mockRejectedValue("string-error");

      const result = await sendToKindleServerFn({
        data: { editionFileId: "ef1" },
      });

      expect(result).toEqual({ success: false, error: "Unknown error" });
    });

    it("creates transport with correct options for starttls", async () => {
      mockFindUnique
        .mockResolvedValueOnce(mockEditionFile())
        .mockResolvedValueOnce({ key: "kindle:email", value: "me@kindle.com" });
      mockGetDecryptedSmtpConfig.mockResolvedValue(smtpConfig);
      mockSendMail.mockResolvedValue({ messageId: "abc" });

      await sendToKindleServerFn({ data: { editionFileId: "ef1" } });

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: "mail.smtp2go.com",
        port: 587,
        secure: false,
        auth: { user: "user@example.com", pass: "secret123" },
        requireTLS: true,
      });
    });

    it("creates transport with secure:true for tls", async () => {
      mockFindUnique
        .mockResolvedValueOnce(mockEditionFile())
        .mockResolvedValueOnce({ key: "kindle:email", value: "me@kindle.com" });
      mockGetDecryptedSmtpConfig.mockResolvedValue({ ...smtpConfig, security: "tls", port: 465 });
      mockSendMail.mockResolvedValue({ messageId: "abc" });

      await sendToKindleServerFn({ data: { editionFileId: "ef1" } });

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: "mail.smtp2go.com",
        port: 465,
        secure: true,
        auth: { user: "user@example.com", pass: "secret123" },
      });
    });
  });
});
