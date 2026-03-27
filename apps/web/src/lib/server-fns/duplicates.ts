import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const getDuplicatesSchema = z.object({
  status: z.enum(["PENDING", "IGNORED", "CONFIRMED", "MERGED"]).optional(),
});

export const getDuplicatesServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(getDuplicatesSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
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
      // Exclude candidates involving sidecar files (direct or via edition files)
      const leftIsSidecar = r.leftFileAsset?.mediaKind === "SIDECAR"
        || r.leftEdition?.editionFiles.some((ef) => ef.fileAsset.mediaKind === "SIDECAR");
      const rightIsSidecar = r.rightFileAsset?.mediaKind === "SIDECAR"
        || r.rightEdition?.editionFiles.some((ef) => ef.fileAsset.mediaKind === "SIDECAR");
      if (leftIsSidecar || rightIsSidecar) return false;

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
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
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
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
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
  .inputValidator(mergeSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const candidate = await db.duplicateCandidate.findUnique({
      where: { id: data.id },
    });

    if (!candidate) {
      throw new Error("Duplicate candidate not found");
    }

    const losingEditionId = (
      candidate.leftEditionId === data.survivingEditionId
        ? candidate.rightEditionId
        : candidate.leftEditionId
    ) as string;

    await db.$transaction(async (tx: {
      editionFile: { updateMany: typeof db.editionFile.updateMany };
      readingProgress: { updateMany: typeof db.readingProgress.updateMany };
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

      // Move reading progress
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
          if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
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
