import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const INTEGRATION_PROVIDERS = ["googlebooks", "hardcover"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export async function encryptValue(plaintext: string, secret: string): Promise<string> {
  const { createHash, createCipheriv, randomBytes } = await import("node:crypto");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export async function decryptValue(ciphertext: string, secret: string): Promise<string> {
  const { createHash, createDecipheriv } = await import("node:crypto");
  const key = createHash("sha256").update(secret).digest();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
}

async function getSecret(): Promise<string> {
  const { loadAuthConfig } = await import("@bookhouse/auth");
  return loadAuthConfig().secret;
}

export const getIntegrationStatusServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");

  const results: Record<string, { configured: boolean; label: string }> = {
    openlibrary: { configured: true, label: "Open Library" },
  };

  for (const provider of INTEGRATION_PROVIDERS) {
    const setting = await db.appSetting.findUnique({ where: { key: `apiKey:${provider}` } });
    const label = provider === "googlebooks" ? "Google Books" : "Hardcover";
    results[provider] = { configured: setting !== null, label };
  }

  return results as {
    openlibrary: { configured: boolean; label: string };
    googlebooks: { configured: boolean; label: string };
    hardcover: { configured: boolean; label: string };
  };
});

const setApiKeySchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
  apiKey: z.string().min(1),
});

export const setApiKeyServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(setApiKeySchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const secret = await getSecret();

    const encrypted = await encryptValue(data.apiKey, secret);
    const key = `apiKey:${data.provider}`;

    await db.appSetting.upsert({
      where: { key },
      create: { key, value: encrypted },
      update: { value: encrypted },
    });

    return { provider: data.provider };
  });

const removeApiKeySchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
});

export const removeApiKeyServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(removeApiKeySchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const key = `apiKey:${data.provider}`;

    try {
      await db.appSetting.delete({ where: { key } });
    } catch (error: unknown) {
      // Prisma P2025 = record not found, ignore
      if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2025") {
        return { provider: data.provider };
      }
      throw error;
    }

    return { provider: data.provider };
  });

const validateApiKeySchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
  apiKey: z.string().min(1),
});

export const validateApiKeyServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(validateApiKeySchema)
  .handler(async ({ data }) => {
    const { searchGoogleBooks, searchHardcover } = await import("@bookhouse/ingest");

    try {
      let result: unknown;
      if (data.provider === "googlebooks") {
        result = await searchGoogleBooks("test", undefined, data.apiKey, fetch);
      } else {
        result = await searchHardcover("test", undefined, data.apiKey, fetch);
      }
      if (result === null) {
        return { valid: false, error: "API returned an error response" };
      }
      return { valid: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { valid: false, error: message };
    }
  });

export async function getDecryptedApiKey(provider: string): Promise<string | null> {
  const { db } = await import("@bookhouse/db");
  const setting = await db.appSetting.findUnique({ where: { key: `apiKey:${provider}` } });
  if (!setting) return null;

  const secret = await getSecret();
  return await decryptValue(setting.value, secret);
}
