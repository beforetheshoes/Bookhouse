import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const KINDLE_COMPATIBLE_MEDIA_KINDS = new Set(["EPUB", "PDF"]);
export const KINDLE_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const getKindleStatusServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const setting = await db.appSetting.findUnique({ where: { key: "kindle:email" } });
  return { configured: setting !== null };
});

export const getKindleConfigServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const setting = await db.appSetting.findUnique({ where: { key: "kindle:email" } });
  if (!setting) return { configured: false as const };

  return {
    configured: true as const,
    email: setting.value,
  };
});

const saveKindleConfigSchema = z.object({
  email: z.string().email().regex(/@kindle\.com$/i, "Must be a @kindle.com address"),
});

export const saveKindleConfigServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(saveKindleConfigSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    await db.appSetting.upsert({
      where: { key: "kindle:email" },
      create: { key: "kindle:email", value: data.email },
      update: { value: data.email },
    });

    return { saved: true };
  });

export const removeKindleConfigServerFn = createServerFn({
  method: "POST",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  await db.appSetting.deleteMany({
    where: { key: { in: ["kindle:email"] } },
  });
  return { removed: true };
});

const sendToKindleSchema = z.object({
  editionFileId: z.string(),
});

export const sendToKindleServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(sendToKindleSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const editionFile = await db.editionFile.findUnique({
      where: { id: data.editionFileId },
      include: { fileAsset: true },
    });

    if (!editionFile) {
      return { success: false, error: "File not found" };
    }

    const { fileAsset } = editionFile;

    if (!KINDLE_COMPATIBLE_MEDIA_KINDS.has(fileAsset.mediaKind)) {
      return { success: false, error: "This file format is not supported by Kindle" };
    }

    if (fileAsset.availabilityStatus !== "PRESENT") {
      return { success: false, error: "File is not available on disk" };
    }

    if (fileAsset.sizeBytes !== null && Number(fileAsset.sizeBytes) > KINDLE_MAX_FILE_SIZE) {
      return { success: false, error: "File exceeds Kindle's 50 MB limit" };
    }

    const kindleSetting = await db.appSetting.findUnique({ where: { key: "kindle:email" } });
    if (!kindleSetting) {
      return { success: false, error: "Kindle email is not configured. Set it up in Settings > Integrations." };
    }

    const { getDecryptedSmtpConfig } = await import("./smtp");
    const smtpConfig = await getDecryptedSmtpConfig();
    if (!smtpConfig) {
      return { success: false, error: "SMTP is not configured. Set it up in Settings > Integrations." };
    }

    const subject = fileAsset.mediaKind === "PDF" ? "CONVERT" : "";
    const contentType = fileAsset.mediaKind === "PDF" ? "application/pdf" : "application/epub+zip";

    try {
      const nodemailer = await import("nodemailer");

      const transportOptions: {
        host: string;
        port: number;
        secure: boolean;
        auth: { user: string; pass: string };
        requireTLS?: boolean;
      } = {
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.security === "tls",
        auth: { user: smtpConfig.username, pass: smtpConfig.password },
      };

      if (smtpConfig.security === "starttls") {
        transportOptions.requireTLS = true;
      }

      const transport = nodemailer.createTransport(transportOptions);
      await transport.sendMail({
        from: smtpConfig.fromAddress,
        to: kindleSetting.value,
        subject,
        text: "Sent via Bookhouse",
        attachments: [{ filename: fileAsset.basename, path: fileAsset.absolutePath, contentType }],
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });
