import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const SMTP_KEYS = [
  "smtp:host",
  "smtp:port",
  "smtp:username",
  "smtp:password",
  "smtp:fromAddress",
  "smtp:security",
] as const;

export type SmtpSecurity = "tls" | "starttls" | "none";

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  security: SmtpSecurity;
}

function settingsToMap(settings: Array<{ key: string; value: string }>): Map<string, string> {
  return new Map(settings.map((s) => [s.key, s.value]));
}

async function getSecret(): Promise<string> {
  const { loadAuthConfig } = await import("@bookhouse/auth");
  return loadAuthConfig().secret;
}

export const getSmtpStatusServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const setting = await db.appSetting.findUnique({ where: { key: "smtp:host" } });
  return { configured: setting !== null };
});

export const getSmtpConfigServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const settings = await db.appSetting.findMany({
    where: { key: { in: [...SMTP_KEYS] } },
  });

  const map = settingsToMap(settings);
  const host = map.get("smtp:host");
  if (!host) return { configured: false as const };

  return {
    configured: true as const,
    host,
    port: Number(map.get("smtp:port") ?? "587"),
    username: map.get("smtp:username") ?? "",
    fromAddress: map.get("smtp:fromAddress") ?? "",
    security: (map.get("smtp:security") ?? "starttls") as SmtpSecurity,
  };
});

const saveSmtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().min(1),
  fromAddress: z.string().email(),
  security: z.enum(["tls", "starttls", "none"]),
});

export const saveSmtpConfigServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(saveSmtpConfigSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { encryptValue } = await import("./integrations");
    const secret = await getSecret();

    const encryptedPassword = await encryptValue(data.password, secret);

    const entries: Array<{ key: string; value: string }> = [
      { key: "smtp:host", value: data.host },
      { key: "smtp:port", value: String(data.port) },
      { key: "smtp:username", value: data.username },
      { key: "smtp:password", value: encryptedPassword },
      { key: "smtp:fromAddress", value: data.fromAddress },
      { key: "smtp:security", value: data.security },
    ];

    await db.$transaction(async (tx: { appSetting: { upsert: typeof db.appSetting.upsert } }) => {
      for (const entry of entries) {
        await tx.appSetting.upsert({
          where: { key: entry.key },
          create: { key: entry.key, value: entry.value },
          update: { value: entry.value },
        });
      }
    });

    return { saved: true };
  });

export const removeSmtpConfigServerFn = createServerFn({
  method: "POST",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  await db.appSetting.deleteMany({
    where: { key: { in: [...SMTP_KEYS] } },
  });
  return { removed: true };
});

const testSmtpConnectionSchema = z.object({
  recipientEmail: z.string().email(),
});

export const testSmtpConnectionServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(testSmtpConnectionSchema)
  .handler(async ({ data }) => {
    const config = await getDecryptedSmtpConfig();
    if (!config) return { success: false, error: "SMTP is not configured" };

    try {
      const nodemailer = await import("nodemailer");

      const transportOptions: {
        host: string;
        port: number;
        secure: boolean;
        auth: { user: string; pass: string };
        requireTLS?: boolean;
      } = {
        host: config.host,
        port: config.port,
        secure: config.security === "tls",
        auth: { user: config.username, pass: config.password },
      };

      if (config.security === "starttls") {
        transportOptions.requireTLS = true;
      }

      const transport = nodemailer.createTransport(transportOptions);
      await transport.verify();
      await transport.sendMail({
        from: config.fromAddress,
        to: data.recipientEmail,
        subject: "Bookhouse SMTP Test",
        text: "This is a test email from Bookhouse to verify your SMTP configuration.",
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });

export async function getDecryptedSmtpConfig(): Promise<SmtpConfig | null> {
  const { db } = await import("@bookhouse/db");
  const { decryptValue } = await import("./integrations");

  const settings = await db.appSetting.findMany({
    where: { key: { in: [...SMTP_KEYS] } },
  });

  const map = settingsToMap(settings);
  const host = map.get("smtp:host");
  if (!host) return null;

  const secret = await getSecret();
  const encryptedPassword = map.get("smtp:password");
  const password = encryptedPassword ? await decryptValue(encryptedPassword, secret) : "";

  return {
    host,
    port: Number(map.get("smtp:port") ?? "587"),
    username: map.get("smtp:username") ?? "",
    password,
    fromAddress: map.get("smtp:fromAddress") ?? "",
    security: (map.get("smtp:security") ?? "starttls") as SmtpSecurity,
  };
}
