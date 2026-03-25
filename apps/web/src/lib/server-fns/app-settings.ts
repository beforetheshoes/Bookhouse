import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DEFAULT_WORKER_CONCURRENCY = 5;

export const getWorkerConcurrencyServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");

  const setting = await db.appSetting.findUnique({ where: { key: "workerConcurrency" } });
  return setting ? Number(setting.value) : DEFAULT_WORKER_CONCURRENCY;
});

export const setWorkerConcurrencyServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ concurrency: z.number().int().min(1).max(20) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    await db.appSetting.upsert({
      where: { key: "workerConcurrency" },
      create: { key: "workerConcurrency", value: String(data.concurrency) },
      update: { value: String(data.concurrency) },
    });

    return { concurrency: data.concurrency };
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
