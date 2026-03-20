import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getReadingProgressServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ workId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("~/lib/auth-server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const { db } = await import("@bookhouse/db");

    const work = await db.work.findUniqueOrThrow({
      where: { id: data.workId },
      include: { editions: { select: { id: true } } },
    });

    const editionIds = work.editions.map((e: { id: string }) => e.id);

    const progress = await db.readingProgress.findMany({
      where: { userId: user.id, editionId: { in: editionIds } },
    });

    const workPref = await db.workProgressPreference.findUnique({
      where: { userId_workId: { userId: user.id, workId: data.workId } },
    });
    const userPref = await db.userPreference.findUnique({
      where: { userId: user.id },
    });
    const trackingMode =
      workPref?.progressTrackingMode ??
      userPref?.progressTrackingMode ??
      "BY_EDITION";

    return { progress, trackingMode };
  });

export const updateReadingProgressServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      editionId: z.string().min(1),
      percent: z.number().min(0).max(100),
      progressKind: z.enum(["EBOOK", "AUDIO", "READALOUD"]),
    }),
  )
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("~/lib/auth-server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const { db } = await import("@bookhouse/db");

    const existing = await db.readingProgress.findFirst({
      where: {
        userId: user.id,
        editionId: data.editionId,
        progressKind: data.progressKind,
      },
    });

    if (existing) {
      return db.readingProgress.update({
        where: { id: existing.id },
        data: { percent: data.percent, locator: {} },
      });
    }

    return db.readingProgress.create({
      data: {
        userId: user.id,
        editionId: data.editionId,
        progressKind: data.progressKind,
        percent: data.percent,
        locator: {},
      },
    });
  });

export const getBulkReadingProgressServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { getCurrentUser } = await import("~/lib/auth-server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { db } = await import("@bookhouse/db");

  const progress = await db.readingProgress.findMany({
    where: { userId: user.id },
    include: { edition: { select: { workId: true } } },
  });

  const result: Record<string, number> = {};
  for (const p of progress) {
    if (p.percent == null) continue;
    const workId = p.edition.workId;
    result[workId] = Math.max(result[workId] ?? 0, p.percent);
  }
  return result;
});
