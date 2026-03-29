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
const mockTransaction = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    appSetting: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      upsert: mockUpsert,
      deleteMany: mockDeleteMany,
    },
    $transaction: mockTransaction,
  },
}));

vi.mock("@bookhouse/auth", () => ({
  loadAuthConfig: () => ({ secret: "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d" }),
}));

const mockVerify = vi.fn();
const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({
  verify: mockVerify,
  sendMail: mockSendMail,
}));

vi.mock("nodemailer", () => ({
  createTransport: mockCreateTransport,
}));

import {
  SMTP_KEYS,
  getSmtpStatusServerFn,
  getSmtpConfigServerFn,
  saveSmtpConfigServerFn,
  removeSmtpConfigServerFn,
  testSmtpConnectionServerFn,
  getDecryptedSmtpConfig,
} from "./smtp";
import { encryptValue } from "./integrations";

describe("smtp server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("SMTP_KEYS", () => {
    it("contains all expected keys", () => {
      expect(SMTP_KEYS).toEqual([
        "smtp:host",
        "smtp:port",
        "smtp:username",
        "smtp:password",
        "smtp:fromAddress",
        "smtp:security",
      ]);
    });
  });

  describe("getSmtpStatusServerFn", () => {
    it("returns configured false when no smtp:host exists", async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getSmtpStatusServerFn({} as never);

      expect(result).toEqual({ configured: false });
      expect(mockFindUnique).toHaveBeenCalledWith({ where: { key: "smtp:host" } });
    });

    it("returns configured true when smtp:host exists", async () => {
      mockFindUnique.mockResolvedValue({ key: "smtp:host", value: "mail.example.com" });

      const result = await getSmtpStatusServerFn({} as never);

      expect(result).toEqual({ configured: true });
    });
  });

  describe("getSmtpConfigServerFn", () => {
    it("returns configured false when no settings exist", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getSmtpConfigServerFn({} as never);

      expect(result).toEqual({ configured: false });
    });

    it("returns config without password when settings exist", async () => {
      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.smtp2go.com" },
        { key: "smtp:port", value: "587" },
        { key: "smtp:username", value: "user@example.com" },
        { key: "smtp:password", value: "encrypted-password" },
        { key: "smtp:fromAddress", value: "books@example.com" },
        { key: "smtp:security", value: "starttls" },
      ]);

      const result = await getSmtpConfigServerFn({} as never);

      expect(result).toEqual({
        configured: true,
        host: "mail.smtp2go.com",
        port: 587,
        username: "user@example.com",
        fromAddress: "books@example.com",
        security: "starttls",
      });
    });

    it("returns configured false when host is missing", async () => {
      mockFindMany.mockResolvedValue([
        { key: "smtp:port", value: "587" },
      ]);

      const result = await getSmtpConfigServerFn({} as never);

      expect(result).toEqual({ configured: false });
    });

    it("uses defaults when optional fields are missing", async () => {
      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.example.com" },
      ]);

      const result = await getSmtpConfigServerFn({} as never);

      expect(result).toEqual({
        configured: true,
        host: "mail.example.com",
        port: 587,
        username: "",
        fromAddress: "",
        security: "starttls",
      });
    });
  });

  describe("saveSmtpConfigServerFn", () => {
    it("encrypts password and upserts all settings in a transaction", async () => {
      type TxArg = { appSetting: { upsert: typeof mockUpsert } };
      mockTransaction.mockImplementation(async (fn: (tx: TxArg) => Promise<void>) => {
        await fn({
          appSetting: { upsert: mockUpsert },
        });
      });

      await saveSmtpConfigServerFn({
        data: {
          host: "mail.smtp2go.com",
          port: 587,
          username: "user@example.com",
          password: "secret123",
          fromAddress: "books@example.com",
          security: "starttls",
        },
      });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledTimes(6);

      // Check host is stored as plain text
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "smtp:host" },
          create: { key: "smtp:host", value: "mail.smtp2go.com" },
          update: { value: "mail.smtp2go.com" },
        }),
      );

      // Check port is stored as string
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "smtp:port" },
          create: { key: "smtp:port", value: "587" },
          update: { value: "587" },
        }),
      );

      // Check password is encrypted (not stored as plain text)
      const pwCallArgs = mockUpsert.mock.calls.find(
        (c: Array<Record<string, Record<string, string>>>) => c[0]?.where?.key === "smtp:password",
      );
      expect(pwCallArgs).toBeDefined();
      const pwCreate = (pwCallArgs as Array<Record<string, Record<string, string>>>)[0]?.create;
      expect(pwCreate?.value).not.toBe("secret123");
    });
  });

  describe("removeSmtpConfigServerFn", () => {
    it("deletes all smtp settings", async () => {
      mockDeleteMany.mockResolvedValue({ count: 6 });

      const result = await removeSmtpConfigServerFn({} as never);

      expect(result).toEqual({ removed: true });
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { key: { in: SMTP_KEYS } },
      });
    });
  });

  describe("testSmtpConnectionServerFn", () => {
    it("sends a test email on success", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const encryptedPw = await encryptValue("secret123", secret);

      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.smtp2go.com" },
        { key: "smtp:port", value: "587" },
        { key: "smtp:username", value: "user@example.com" },
        { key: "smtp:password", value: encryptedPw },
        { key: "smtp:fromAddress", value: "books@example.com" },
        { key: "smtp:security", value: "starttls" },
      ]);

      mockVerify.mockResolvedValue(true);
      mockSendMail.mockResolvedValue({ messageId: "abc123" });

      const result = await testSmtpConnectionServerFn({
        data: { recipientEmail: "test@example.com" },
      });

      expect(result).toEqual({ success: true });
      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: "mail.smtp2go.com",
        port: 587,
        secure: false,
        auth: { user: "user@example.com", pass: "secret123" },
        requireTLS: true,
      });
      expect(mockSendMail).toHaveBeenCalledWith({
        from: "books@example.com",
        to: "test@example.com",
        subject: "Bookhouse SMTP Test",
        text: "This is a test email from Bookhouse to verify your SMTP configuration.",
      });
    });

    it("creates transport with secure:true for tls security", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const encryptedPw = await encryptValue("secret123", secret);

      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.smtp2go.com" },
        { key: "smtp:port", value: "465" },
        { key: "smtp:username", value: "user@example.com" },
        { key: "smtp:password", value: encryptedPw },
        { key: "smtp:fromAddress", value: "books@example.com" },
        { key: "smtp:security", value: "tls" },
      ]);

      mockVerify.mockResolvedValue(true);
      mockSendMail.mockResolvedValue({ messageId: "abc123" });

      await testSmtpConnectionServerFn({
        data: { recipientEmail: "test@example.com" },
      });

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: "mail.smtp2go.com",
        port: 465,
        secure: true,
        auth: { user: "user@example.com", pass: "secret123" },
      });
    });

    it("creates transport with no TLS options for none security", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const encryptedPw = await encryptValue("secret123", secret);

      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.smtp2go.com" },
        { key: "smtp:port", value: "25" },
        { key: "smtp:username", value: "user@example.com" },
        { key: "smtp:password", value: encryptedPw },
        { key: "smtp:fromAddress", value: "books@example.com" },
        { key: "smtp:security", value: "none" },
      ]);

      mockVerify.mockResolvedValue(true);
      mockSendMail.mockResolvedValue({ messageId: "abc123" });

      await testSmtpConnectionServerFn({
        data: { recipientEmail: "test@example.com" },
      });

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: "mail.smtp2go.com",
        port: 25,
        secure: false,
        auth: { user: "user@example.com", pass: "secret123" },
      });
    });

    it("returns error when SMTP is not configured", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await testSmtpConnectionServerFn({
        data: { recipientEmail: "test@example.com" },
      });

      expect(result).toEqual({ success: false, error: "SMTP is not configured" });
    });

    it("returns error when verify fails", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const encryptedPw = await encryptValue("secret123", secret);

      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.smtp2go.com" },
        { key: "smtp:port", value: "587" },
        { key: "smtp:username", value: "user@example.com" },
        { key: "smtp:password", value: encryptedPw },
        { key: "smtp:fromAddress", value: "books@example.com" },
        { key: "smtp:security", value: "starttls" },
      ]);

      mockVerify.mockRejectedValue(new Error("Connection refused"));

      const result = await testSmtpConnectionServerFn({
        data: { recipientEmail: "test@example.com" },
      });

      expect(result).toEqual({ success: false, error: "Connection refused" });
    });

    it("returns error when sendMail fails", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const encryptedPw = await encryptValue("secret123", secret);

      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.smtp2go.com" },
        { key: "smtp:port", value: "587" },
        { key: "smtp:username", value: "user@example.com" },
        { key: "smtp:password", value: encryptedPw },
        { key: "smtp:fromAddress", value: "books@example.com" },
        { key: "smtp:security", value: "starttls" },
      ]);

      mockVerify.mockResolvedValue(true);
      mockSendMail.mockRejectedValue(new Error("Rejected by server"));

      const result = await testSmtpConnectionServerFn({
        data: { recipientEmail: "test@example.com" },
      });

      expect(result).toEqual({ success: false, error: "Rejected by server" });
    });

    it("returns Unknown error for non-Error exceptions", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const encryptedPw = await encryptValue("secret123", secret);

      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.smtp2go.com" },
        { key: "smtp:port", value: "587" },
        { key: "smtp:username", value: "user@example.com" },
        { key: "smtp:password", value: encryptedPw },
        { key: "smtp:fromAddress", value: "books@example.com" },
        { key: "smtp:security", value: "starttls" },
      ]);

      mockVerify.mockRejectedValue("string-error");

      const result = await testSmtpConnectionServerFn({
        data: { recipientEmail: "test@example.com" },
      });

      expect(result).toEqual({ success: false, error: "Unknown error" });
    });
  });

  describe("getDecryptedSmtpConfig", () => {
    it("returns null when no settings exist", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getDecryptedSmtpConfig();

      expect(result).toBeNull();
    });

    it("returns full decrypted config", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const encryptedPw = await encryptValue("my-password", secret);

      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.smtp2go.com" },
        { key: "smtp:port", value: "587" },
        { key: "smtp:username", value: "user@example.com" },
        { key: "smtp:password", value: encryptedPw },
        { key: "smtp:fromAddress", value: "books@example.com" },
        { key: "smtp:security", value: "starttls" },
      ]);

      const result = await getDecryptedSmtpConfig();

      expect(result).toEqual({
        host: "mail.smtp2go.com",
        port: 587,
        username: "user@example.com",
        password: "my-password",
        fromAddress: "books@example.com",
        security: "starttls",
      });
    });

    it("returns null when host is missing", async () => {
      mockFindMany.mockResolvedValue([
        { key: "smtp:port", value: "587" },
      ]);

      const result = await getDecryptedSmtpConfig();

      expect(result).toBeNull();
    });

    it("uses defaults for missing optional fields including empty password", async () => {
      mockFindMany.mockResolvedValue([
        { key: "smtp:host", value: "mail.example.com" },
      ]);

      const result = await getDecryptedSmtpConfig();

      expect(result).toEqual({
        host: "mail.example.com",
        port: 587,
        username: "",
        password: "",
        fromAddress: "",
        security: "starttls",
      });
    });
  });
});
