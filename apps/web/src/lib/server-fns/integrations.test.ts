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
const mockUpsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    appSetting: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
      delete: mockDelete,
    },
  },
}));

vi.mock("@bookhouse/auth", () => ({
  loadAuthConfig: () => ({ secret: "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d" }),
}));

const mockValidateGoogleBooksKey = vi.fn();
const mockValidateHardcoverKey = vi.fn();

vi.mock("@bookhouse/ingest", () => ({
  searchGoogleBooks: mockValidateGoogleBooksKey,
  searchHardcover: mockValidateHardcoverKey,
}));

import {
  getIntegrationStatusServerFn,
  setApiKeyServerFn,
  removeApiKeyServerFn,
  getDecryptedApiKey,
  encryptValue,
  decryptValue,
  validateApiKeyServerFn,
  INTEGRATION_PROVIDERS,
} from "./integrations";

describe("integrations server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("INTEGRATION_PROVIDERS", () => {
    it("includes googlebooks and hardcover", () => {
      expect(INTEGRATION_PROVIDERS).toContain("googlebooks");
      expect(INTEGRATION_PROVIDERS).toContain("hardcover");
    });
  });

  describe("encryptValue / decryptValue", () => {
    it("round-trips a value", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const plaintext = "my-api-key-12345";
      const encrypted = await encryptValue(plaintext, secret);
      expect(encrypted).not.toBe(plaintext);
      expect(await decryptValue(encrypted, secret)).toBe(plaintext);
    });

    it("produces different ciphertext for same plaintext (random IV)", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const a = await encryptValue("same", secret);
      const b = await encryptValue("same", secret);
      expect(a).not.toBe(b);
    });

    it("throws on tampered ciphertext", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const encrypted = await encryptValue("data", secret);
      const tampered = encrypted.slice(0, -2) + "xx";
      await expect(decryptValue(tampered, secret)).rejects.toThrow();
    });

    it("throws when decrypting with a different secret", async () => {
      const secret1 = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const secret2 = "z]9y8x7w6v5u4t3s2r1q0p9o8n7m6l5";
      const encrypted = await encryptValue("my-secret-data", secret1);
      await expect(decryptValue(encrypted, secret2)).rejects.toThrow();
    });
  });

  describe("getIntegrationStatusServerFn", () => {
    it("returns false for all providers when no keys are stored", async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getIntegrationStatusServerFn({} as never);

      expect(result).toEqual({
        openlibrary: { configured: true, label: "Open Library" },
        googlebooks: { configured: false, label: "Google Books" },
        hardcover: { configured: false, label: "Hardcover" },
      });
    });

    it("returns true for a provider with a stored key", async () => {
      mockFindUnique.mockImplementation(({ where }: { where: { key: string } }) => {
        if (where.key === "apiKey:googlebooks") return { key: "apiKey:googlebooks", value: "encrypted" };
        return null;
      });

      const result = await getIntegrationStatusServerFn({} as never);

      expect(result.googlebooks.configured).toBe(true);
      expect(result.hardcover.configured).toBe(false);
    });
  });

  describe("setApiKeyServerFn", () => {
    it("encrypts and stores the API key", async () => {
      mockUpsert.mockResolvedValue({});

      await setApiKeyServerFn({ data: { provider: "googlebooks", apiKey: "test-key-123" } });

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const args = mockUpsert.mock.calls[0] as Array<object>;
      const call = args[0] as { where: { key: string }; create: { key: string; value: string }; update: { value: string } };
      expect(call.where.key).toBe("apiKey:googlebooks");
      expect(call.create.value).not.toBe("test-key-123");
      expect(call.update.value).not.toBe("test-key-123");
    });

    it("stores hardcover key under correct key", async () => {
      mockUpsert.mockResolvedValue({});

      await setApiKeyServerFn({ data: { provider: "hardcover", apiKey: "hc-key" } });

      const args = mockUpsert.mock.calls[0] as Array<object>;
      const call = args[0] as { where: { key: string } };
      expect(call.where.key).toBe("apiKey:hardcover");
    });
  });

  describe("removeApiKeyServerFn", () => {
    it("deletes the stored key", async () => {
      mockDelete.mockResolvedValue({});

      await removeApiKeyServerFn({ data: { provider: "hardcover" } });

      expect(mockDelete).toHaveBeenCalledWith({ where: { key: "apiKey:hardcover" } });
    });

    it("does not throw if key does not exist (P2025)", async () => {
      mockDelete.mockRejectedValue(
        Object.assign(new Error("Record not found"), { code: "P2025" }),
      );

      const result = await removeApiKeyServerFn({ data: { provider: "hardcover" } });

      expect(result).toEqual({ provider: "hardcover" });
    });

    it("rethrows non-P2025 errors", async () => {
      mockDelete.mockRejectedValue(new Error("Connection lost"));

      await expect(
        removeApiKeyServerFn({ data: { provider: "googlebooks" } }),
      ).rejects.toThrow("Connection lost");
    });
  });

  describe("validateApiKeyServerFn", () => {
    it("returns valid for googlebooks when search succeeds", async () => {
      mockValidateGoogleBooksKey.mockResolvedValue([]);

      const result = await validateApiKeyServerFn({ data: { provider: "googlebooks", apiKey: "good-key" } });

      expect(result).toEqual({ valid: true });
      expect(mockValidateGoogleBooksKey).toHaveBeenCalledWith("test", undefined, "good-key", expect.any(Function) as () => void);
    });

    it("returns invalid for googlebooks when search throws", async () => {
      mockValidateGoogleBooksKey.mockRejectedValue(new Error("API key invalid"));

      const result = await validateApiKeyServerFn({ data: { provider: "googlebooks", apiKey: "bad-key" } });

      expect(result).toEqual({ valid: false, error: "API key invalid" });
    });

    it("returns valid for hardcover when search succeeds", async () => {
      mockValidateHardcoverKey.mockResolvedValue([]);

      const result = await validateApiKeyServerFn({ data: { provider: "hardcover", apiKey: "good-hc-key" } });

      expect(result).toEqual({ valid: true });
      expect(mockValidateHardcoverKey).toHaveBeenCalledWith("test", undefined, "good-hc-key", expect.any(Function) as () => void);
    });

    it("returns invalid for hardcover when search throws", async () => {
      mockValidateHardcoverKey.mockRejectedValue(new Error("Unauthorized"));

      const result = await validateApiKeyServerFn({ data: { provider: "hardcover", apiKey: "bad-hc-key" } });

      expect(result).toEqual({ valid: false, error: "Unauthorized" });
    });

    it("returns Unknown error when a non-Error is thrown", async () => {
      mockValidateGoogleBooksKey.mockRejectedValue("string error");

      const result = await validateApiKeyServerFn({ data: { provider: "googlebooks", apiKey: "key" } });

      expect(result).toEqual({ valid: false, error: "Unknown error" });
    });

    it("returns invalid for googlebooks when search returns null (API error)", async () => {
      mockValidateGoogleBooksKey.mockResolvedValue(null);

      const result = await validateApiKeyServerFn({ data: { provider: "googlebooks", apiKey: "bad-key" } });

      expect(result).toEqual({ valid: false, error: "API returned an error response" });
    });
  });

  describe("getDecryptedApiKey", () => {
    it("returns null when no key is stored", async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getDecryptedApiKey("googlebooks");

      expect(result).toBeNull();
    });

    it("returns decrypted key when stored", async () => {
      const secret = "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d";
      const encrypted = await encryptValue("my-real-key", secret);
      mockFindUnique.mockResolvedValue({ key: "apiKey:googlebooks", value: encrypted });

      const result = await getDecryptedApiKey("googlebooks");

      expect(result).toBe("my-real-key");
    });
  });
});
