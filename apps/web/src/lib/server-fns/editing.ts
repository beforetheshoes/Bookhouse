import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Prisma } from "@bookhouse/db";

const updateWorkSchema = z.object({
  workId: z.string().min(1),
  fields: z.object({
    titleDisplay: z.string().optional(),
    description: z.string().nullable().optional(),
    sortTitle: z.string().nullable().optional(),
  }),
});

export const updateWorkServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(updateWorkSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { canonicalizeBookTitle } = await import("@bookhouse/ingest");

    if (
      data.fields.titleDisplay !== undefined &&
      data.fields.titleDisplay.trim() === ""
    ) {
      throw new Error("Title cannot be blank");
    }

    const work = await db.work.findUnique({
      where: { id: data.workId },
      select: { editedFields: true },
    });

    const existingEdited = work?.editedFields ?? [];
    const newFieldKeys = Object.keys(data.fields);
    const mergedEdited = [...new Set([...existingEdited, ...newFieldKeys])];

    const updateData: Prisma.WorkUpdateInput = {
      ...data.fields,
      editedFields: mergedEdited,
    };

    if (data.fields.titleDisplay !== undefined) {
      updateData.titleCanonical = canonicalizeBookTitle(data.fields.titleDisplay);
    }

    await db.work.update({
      where: { id: data.workId },
      data: updateData,
    });

    return { success: true };
  });

const updateEditionSchema = z.object({
  editionId: z.string().min(1),
  fields: z.object({
    isbn13: z.string().nullable().optional(),
    isbn10: z.string().nullable().optional(),
    publisher: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    asin: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
  }),
});

export const updateEditionServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(updateEditionSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const edition = await db.edition.findUnique({
      where: { id: data.editionId },
      select: { editedFields: true },
    });

    const existingEdited = edition?.editedFields ?? [];
    const newFieldKeys = Object.keys(data.fields);
    const mergedEdited = [...new Set([...existingEdited, ...newFieldKeys])];

    const { publishedAt: publishedAtStr, ...otherFields } = data.fields;
    const updateData: Prisma.EditionUpdateInput = {
      ...otherFields,
      editedFields: mergedEdited,
    };

    if (publishedAtStr !== undefined) {
      updateData.publishedAt = publishedAtStr !== null ? new Date(publishedAtStr) : null;
    }

    await db.edition.update({
      where: { id: data.editionId },
      data: updateData,
    });

    return { success: true };
  });

const updateWorkAuthorsSchema = z.object({
  workId: z.string().min(1),
  authors: z.array(z.string().min(1)).min(1, "At least one author is required"),
});

export const updateWorkAuthorsServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(updateWorkAuthorsSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { canonicalizeContributorName } = await import("@bookhouse/ingest");

    if (data.authors.length === 0) {
      throw new Error("At least one author is required");
    }

    const work = await db.work.findUnique({
      where: { id: data.workId },
      select: { editedFields: true },
    });

    const editions = await db.edition.findMany({
      where: { workId: data.workId },
      select: { id: true },
    });

    const editionIds = editions.map((e: { id: string }) => e.id);

    // Resolve or create contributors
    const contributorIds: string[] = [];
    for (const authorName of data.authors) {
      const canonical = canonicalizeContributorName(authorName) ?? authorName.toLowerCase();
      const existing = await db.contributor.findFirst({
        where: { nameCanonical: canonical },
      });

      if (existing) {
        contributorIds.push(existing.id);
      } else {
        const created = await db.contributor.create({
          data: {
            nameDisplay: authorName,
            nameCanonical: canonical,
          },
        });
        contributorIds.push(created.id);
      }
    }

    await db.$transaction(async () => {
      // Remove all existing AUTHOR contributors from all editions
      await db.editionContributor.deleteMany({
        where: {
          editionId: { in: editionIds },
          role: "AUTHOR",
        },
      });

      // Create new AUTHOR contributors for each edition
      const createData = editionIds.flatMap((editionId: string) =>
        contributorIds.map((contributorId) => ({
          editionId,
          contributorId,
          role: "AUTHOR" as const,
        })),
      );

      await db.editionContributor.createMany({
        data: createData,
        skipDuplicates: true,
      });
    });

    // Track authors as manually edited on the work
    const existingEdited = work?.editedFields ?? [];
    const mergedEdited = [...new Set([...existingEdited, "authors"])];

    await db.work.update({
      where: { id: data.workId },
      data: { editedFields: mergedEdited },
    });

    return { success: true };
  });

export const getContributorNamesServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const contributors = await db.contributor.findMany({
    where: { editions: { some: {} } },
    select: { nameDisplay: true },
    orderBy: { nameDisplay: "asc" },
  });
  return contributors.map((c) => c.nameDisplay);
});
