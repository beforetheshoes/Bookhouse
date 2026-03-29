import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { backupManifestSchema, type BackupManifest } from "~/lib/backup/manifest";

const MAX_HISTORY = 20;

export const getBackupHistoryServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");

  const setting = await db.appSetting.findUnique({
    where: { key: "backupHistory" },
  });

  if (!setting) return [] as BackupManifest[];

  try {
    const parsed = JSON.parse(setting.value) as Record<string, number | string>[];
    return z.array(backupManifestSchema).parse(parsed);
  } catch {
    return [] as BackupManifest[];
  }
});

export const recordBackupServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(backupManifestSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const setting = await db.appSetting.findUnique({
      where: { key: "backupHistory" },
    });

    let existing: BackupManifest[] = [];
    if (setting) {
      try {
        existing = z.array(backupManifestSchema).parse(JSON.parse(setting.value));
      } catch {
        // ignore corrupt history
      }
    }

    const updated = [data, ...existing].slice(0, MAX_HISTORY);

    await db.appSetting.upsert({
      where: { key: "backupHistory" },
      create: { key: "backupHistory", value: JSON.stringify(updated) },
      update: { value: JSON.stringify(updated) },
    });
  });
