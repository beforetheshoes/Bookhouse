import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isUniqueConstraintError } from "@bookhouse/shared";

const getDuplicatesSchema = z.object({
  status: z.enum(["PENDING", "IGNORED", "CONFIRMED", "MERGED"]).optional(),
});

export const getDuplicatesServerFn = createServerFn({
  method: "GET",
})
  .validator(getDuplicatesSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const EXCLUDED_MEDIA_KINDS = new Set(["SIDECAR", "AUDIO", "COVER", "OTHER"]);
    const rows = await db.duplicateCandidate.findMany({
      ...(data.status ? { where: { status: data.status } } : {}),
      include: {
        leftEdition: {
          include: {
            work: true,
            contributors: { include: { contributor: true } },
            editionFiles: { include: { fileAsset: true } },
          },
        },
        rightEdition: {
          include: {
            work: true,
            contributors: { include: { contributor: true } },
            editionFiles: { include: { fileAsset: true } },
          },
        },
        leftFileAsset: true,
        rightFileAsset: true,
      },
      orderBy: { confidence: "desc" },
    });
    return rows.filter((r) => {
      const leftHasExcludedMediaKind = (r.leftFileAsset?.mediaKind !== undefined && EXCLUDED_MEDIA_KINDS.has(r.leftFileAsset.mediaKind))
        || r.leftEdition?.editionFiles.some((ef) => EXCLUDED_MEDIA_KINDS.has(ef.fileAsset.mediaKind));
      const rightHasExcludedMediaKind = (r.rightFileAsset?.mediaKind !== undefined && EXCLUDED_MEDIA_KINDS.has(r.rightFileAsset.mediaKind))
        || r.rightEdition?.editionFiles.some((ef) => EXCLUDED_MEDIA_KINDS.has(ef.fileAsset.mediaKind));
      if (leftHasExcludedMediaKind || rightHasExcludedMediaKind) return false;

      return true;
    });
  });

export type DuplicateRow = Awaited<
  ReturnType<typeof getDuplicatesServerFn>
>[number];

const idSchema = z.object({ id: z.string() });

export const ignoreDuplicateServerFn = createServerFn({
  method: "POST",
})
  .validator(idSchema)
  .handler(async ({ data }) => {
    await (await import("./_guards")).ownerOnly();
    const { db } = await import("@bookhouse/db");
    await db.duplicateCandidate.update({
      where: { id: data.id },
      data: { status: "IGNORED" },
    });
    return { success: true };
  });

export const confirmDuplicateServerFn = createServerFn({
  method: "POST",
})
  .validator(idSchema)
  .handler(async ({ data }) => {
    await (await import("./_guards")).ownerOnly();
    const { db } = await import("@bookhouse/db");
    await db.duplicateCandidate.update({
      where: { id: data.id },
      data: { status: "CONFIRMED" },
    });
    return { success: true };
  });

const mergeSchema = z.object({
  id: z.string(),
  survivingEditionId: z.string(),
});

export const mergeDuplicateServerFn = createServerFn({
  method: "POST",
})
  .validator(mergeSchema)
  .handler(async ({ data }) => {
    await (await import("./_guards")).ownerOnly();
    const { db } = await import("@bookhouse/db");

    const candidate = await db.duplicateCandidate.findUnique({
      where: { id: data.id },
    });

    if (!candidate) {
      throw new Error("Duplicate candidate not found");
    }

    const { leftEditionId, rightEditionId } = candidate;
    // File-level candidates (SAME_HASH) carry no edition ids, and a stale UI
    // could name an edition outside the pair; both would otherwise re-parent
    // an unrelated edition's files and delete the wrong row.
    if (leftEditionId === null || rightEditionId === null) {
      throw new Error("This duplicate candidate has no editions to merge");
    }
    if (data.survivingEditionId !== leftEditionId && data.survivingEditionId !== rightEditionId) {
      throw new Error("Surviving edition must be one of the candidate's editions");
    }
    const losingEditionId = leftEditionId === data.survivingEditionId ? rightEditionId : leftEditionId;

    await db.$transaction(async (tx: {
      editionFile: { updateMany: typeof db.editionFile.updateMany };
      readingProgress: {
        findMany: typeof db.readingProgress.findMany;
        deleteMany: typeof db.readingProgress.deleteMany;
        updateMany: typeof db.readingProgress.updateMany;
      };
      editionContributor: {
        findMany: typeof db.editionContributor.findMany;
        create: typeof db.editionContributor.create;
        deleteMany: typeof db.editionContributor.deleteMany;
      };
      edition: { delete: typeof db.edition.delete };
      duplicateCandidate: { update: typeof db.duplicateCandidate.update };
    }) => {
      // Move edition files
      await tx.editionFile.updateMany({
        where: { editionId: losingEditionId },
        data: { editionId: data.survivingEditionId },
      });

      // Move reading progress. A user with a row for the same kind + source on
      // both editions keeps the surviving edition's row; moving the loser's
      // would hit the (userId, editionId, progressKind, source) unique key.
      const progressKey = (row: { userId: string; progressKind: string; source: string }) =>
        `${row.userId}|${row.progressKind}|${row.source}`;
      const survivingProgress = await tx.readingProgress.findMany({
        where: { editionId: data.survivingEditionId },
        select: { userId: true, progressKind: true, source: true },
      });
      const taken = new Set(survivingProgress.map(progressKey));
      const losingProgress = await tx.readingProgress.findMany({
        where: { editionId: losingEditionId },
        select: { id: true, userId: true, progressKind: true, source: true },
      });
      const colliding = losingProgress.filter((row) => taken.has(progressKey(row))).map((row) => row.id);
      if (colliding.length > 0) {
        await tx.readingProgress.deleteMany({ where: { id: { in: colliding } } });
      }
      await tx.readingProgress.updateMany({
        where: { editionId: losingEditionId },
        data: { editionId: data.survivingEditionId },
      });

      // Move contributors (skip if already exists)
      const losingContributors = await tx.editionContributor.findMany({
        where: { editionId: losingEditionId },
      });

      for (const ec of losingContributors) {
        try {
          await tx.editionContributor.create({
            data: {
              editionId: data.survivingEditionId,
              contributorId: ec.contributorId,
              role: ec.role,
            },
          });
        } catch (err) {
          if (err instanceof Error && isUniqueConstraintError(err)) {
            // Already exists on surviving edition — skip
            continue;
          }
          throw err;
        }
      }

      await tx.editionContributor.deleteMany({
        where: { editionId: losingEditionId },
      });

      // Delete losing edition
      await tx.edition.delete({
        where: { id: losingEditionId },
      });

      // Mark candidate as merged
      await tx.duplicateCandidate.update({
        where: { id: data.id },
        data: { status: "MERGED" },
      });
    });

    return { success: true };
  });
