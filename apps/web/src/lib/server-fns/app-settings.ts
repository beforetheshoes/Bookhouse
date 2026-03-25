import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ScanType = "full" | "onDemand" | "incremental";

export const SCAN_CONCURRENCY_DEFAULTS: Record<ScanType, number> = {
  full: 8,
  onDemand: 5,
  incremental: 3,
};

const SCAN_CONCURRENCY_KEYS: Record<ScanType, string> = {
  full: "concurrencyFull",
  onDemand: "concurrencyOnDemand",
  incremental: "concurrencyIncremental",
};

export const getAllScanConcurrenciesServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");

  const settings = await db.appSetting.findMany({
    where: { key: { in: Object.values(SCAN_CONCURRENCY_KEYS) } },
  });

  const map = new Map(settings.map((s: { key: string; value: string }) => [s.key, s.value]));

  return {
    full: Number(map.get(SCAN_CONCURRENCY_KEYS.full)) || SCAN_CONCURRENCY_DEFAULTS.full,
    onDemand: Number(map.get(SCAN_CONCURRENCY_KEYS.onDemand)) || SCAN_CONCURRENCY_DEFAULTS.onDemand,
    incremental: Number(map.get(SCAN_CONCURRENCY_KEYS.incremental)) || SCAN_CONCURRENCY_DEFAULTS.incremental,
  };
});

export const setScanConcurrencyServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({
    scanType: z.enum(["full", "onDemand", "incremental"]),
    concurrency: z.number().int().min(1).max(20),
  }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const key = SCAN_CONCURRENCY_KEYS[data.scanType as ScanType];

    await db.appSetting.upsert({
      where: { key },
      create: { key, value: String(data.concurrency) },
      update: { value: String(data.concurrency) },
    });

    return { scanType: data.scanType as ScanType, concurrency: data.concurrency };
  });

export type MissingFileBehavior = "auto-cleanup" | "manual";

export const getMissingFileBehaviorServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");

  const setting = await db.appSetting.findUnique({ where: { key: "missingFileBehavior" } });
  return (setting?.value ?? "manual") as MissingFileBehavior;
});

export const setMissingFileBehaviorServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ behavior: z.enum(["auto-cleanup", "manual"]) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    await db.appSetting.upsert({
      where: { key: "missingFileBehavior" },
      create: { key: "missingFileBehavior", value: data.behavior },
      update: { value: data.behavior },
    });

    return { behavior: data.behavior as MissingFileBehavior };
  });

export type ThemePreference = "light" | "dark" | "system";

export const getThemeServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");

  const setting = await db.appSetting.findUnique({ where: { key: "theme" } });
  return (setting?.value ?? "system") as ThemePreference;
});

export const setThemeServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ theme: z.enum(["light", "dark", "system"]) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    await db.appSetting.upsert({
      where: { key: "theme" },
      create: { key: "theme", value: data.theme },
      update: { value: data.theme },
    });

    return { theme: data.theme as ThemePreference };
  });
