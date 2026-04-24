import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAuthorsListServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const contributors = await db.contributor.findMany({
    where: {
      editions: { some: { role: "AUTHOR" } },
    },
    include: {
      editions: {
        where: { role: "AUTHOR" },
        include: { edition: { select: { workId: true } } },
      },
    },
    orderBy: { nameSort: "asc" },
  });
  return contributors.map((c) => ({
    id: c.id,
    nameDisplay: c.nameDisplay,
    workCount: new Set(c.editions.map((ec) => ec.edition.workId)).size,
    imagePath: c.imagePath,
  }));
});

export type AuthorListItem = Awaited<
  ReturnType<typeof getAuthorsListServerFn>
>[number];

const getAuthorDetailSchema = z.object({
  authorId: z.string().min(1),
});

export const getAuthorDetailServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(getAuthorDetailSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const contributor = await db.contributor.findUniqueOrThrow({
      where: { id: data.authorId },
      select: {
        id: true,
        nameDisplay: true,
        nameCanonical: true,
        nameSort: true,
        imagePath: true,
        editions: {
          where: { role: "AUTHOR" },
          select: { edition: { select: { workId: true } } },
        },
      },
    });

    const workIds = [...new Set(contributor.editions.map((ec) => ec.edition.workId))];

    const works = await db.work.findMany({
      where: { id: { in: workIds } },
      include: {
        series: true,
        editions: {
          include: {
            contributors: { include: { contributor: true } },
          },
        },
      },
    });

    return {
      id: contributor.id,
      nameDisplay: contributor.nameDisplay,
      nameCanonical: contributor.nameCanonical,
      nameSort: contributor.nameSort,
      imagePath: contributor.imagePath,
      works,
    };
  });

export type AuthorDetail = Awaited<
  ReturnType<typeof getAuthorDetailServerFn>
>;

export const getEnrichAuthorPhotosProgressServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { getActiveEnrichmentJobCount } = await import("@bookhouse/shared");
  const activeCount = await getActiveEnrichmentJobCount("enrich-contributor");
  return { activeCount };
});

export const enrichAuthorPhotosServerFn = createServerFn({
  method: "POST",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const { enqueueEnrichmentJob } = await import("@bookhouse/shared");

  const contributors = await db.contributor.findMany({
    where: { imagePath: null },
    select: { id: true },
  });

  if (contributors.length === 0) {
    return { enqueuedCount: 0 };
  }

  const importJob = await db.importJob.create({
    data: {
      kind: "ENRICH_AUTHOR_PHOTOS",
      status: "QUEUED",
      totalFiles: contributors.length,
      processedFiles: 0,
      errorCount: 0,
    },
  });

  for (const contributor of contributors) {
    await enqueueEnrichmentJob("enrich-contributor", {
      contributorId: contributor.id,
      importJobId: importJob.id,
    });
  }

  return { enqueuedCount: contributors.length, importJobId: importJob.id };
});

const fetchAuthorPhotoSchema = z.object({
  contributorId: z.string().min(1),
  imageUrl: z.string().url(),
});

export const fetchAuthorPhotoFromUrlServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(fetchAuthorPhotoSchema)
  .handler(async ({ data }) => {
    const { applyAuthorPhotoFromUrl, resizeAndSaveCover } = await import("@bookhouse/ingest");
    const { db } = await import("@bookhouse/db");

    const coverCacheDir = process.env.COVER_CACHE_DIR ?? "/data/covers";

    await applyAuthorPhotoFromUrl(
      { contributorId: data.contributorId, imageUrl: data.imageUrl, coverCacheDir },
      {
        fetchUrl: async (url) => {
          const response = await fetch(url);
          const buffer = Buffer.from(await response.arrayBuffer());
          const contentType = response.headers.get("content-type");
          return { buffer, contentType };
        },
        resizeAndSave: (buf, dir) => resizeAndSaveCover(buf, dir),
      },
      {
        findContributor: (id) => db.contributor.findUnique({ where: { id }, select: { id: true } }),
        updateContributor: async (id, upd) => { await db.contributor.update({ where: { id }, data: upd }); },
      },
    );

    return { success: true };
  });
