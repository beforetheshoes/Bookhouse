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
