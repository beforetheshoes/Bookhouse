import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getReadingProgressServerFn = createServerFn({
  method: "GET",
})
  .validator(z.object({ workId: z.string().min(1) }))
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
  .validator(
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

    // Atomic upsert on the per-source unique key — never touches a kobo/koreader
    // row for the same edition, and avoids a find-then-create race.
    return db.readingProgress.upsert({
      where: {
        userId_editionId_progressKind_source: {
          userId: user.id,
          editionId: data.editionId,
          progressKind: data.progressKind,
          source: "manual",
        },
      },
      create: {
        userId: user.id,
        editionId: data.editionId,
        progressKind: data.progressKind,
        percent: data.percent,
        locator: {},
        source: "manual",
      },
      update: { percent: data.percent, locator: {} },
    });
  });

/**
 * Marking a work read is a statement about the book, not about one file, so
 * every edition is set to 100% — a work with both an ebook and an audiobook
 * would otherwise show one full bar beside one empty bar. Only the manual row
 * is touched; kobo/koreader rows for the same edition keep their own state.
 */
export const markWorksAsReadServerFn = createServerFn({
  method: "POST",
})
  .validator(z.object({ workIds: z.array(z.string().min(1)).min(1) }))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("~/lib/auth-server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const { db } = await import("@bookhouse/db");
    const { progressKindForEdition } = await import("~/lib/progress-kind");

    const editions = await db.edition.findMany({
      where: { workId: { in: data.workIds } },
      select: { id: true, workId: true, formatFamily: true },
    });

    for (const edition of editions) {
      const progressKind = progressKindForEdition(edition.formatFamily);
      await db.readingProgress.upsert({
        where: {
          userId_editionId_progressKind_source: {
            userId: user.id,
            editionId: edition.id,
            progressKind,
            source: "manual",
          },
        },
        create: {
          userId: user.id,
          editionId: edition.id,
          progressKind,
          percent: 100,
          locator: {},
          source: "manual",
        },
        update: { percent: 100, locator: {} },
      });
    }

    // A requested work with no editions has nothing to mark, so it is left out
    // of the count the caller reports back to the user.
    const markedWorkIds = data.workIds.filter((workId) =>
      editions.some((edition: { workId: string }) => edition.workId === workId),
    );

    return { markedWorkIds, markedEditionCount: editions.length };
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
