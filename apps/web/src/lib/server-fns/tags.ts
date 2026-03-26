import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const updateWorkTagsSchema = z.object({
  workId: z.string().min(1),
  tags: z.array(z.string()),
});

export const updateWorkTagsServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(updateWorkTagsSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const work = await db.work.findUnique({
      where: { id: data.workId },
      select: { editedFields: true },
    });

    // Resolve or create tags
    const tagIds: string[] = [];
    for (const tagName of data.tags) {
      const trimmed = tagName.trim();
      if (trimmed === "") continue;
      const canonical = trimmed.toLowerCase();
      const existing = await db.tag.findFirst({
        where: { nameCanonical: canonical },
      });

      if (existing) {
        tagIds.push(existing.id);
      } else {
        const created = await db.tag.create({
          data: { name: trimmed, nameCanonical: canonical },
        });
        tagIds.push(created.id);
      }
    }

    await db.$transaction(async () => {
      await db.workTag.deleteMany({
        where: { workId: data.workId },
      });

      await db.workTag.createMany({
        data: tagIds.map((tagId) => ({
          workId: data.workId,
          tagId,
        })),
        skipDuplicates: true,
      });
    });

    const existingEdited = work?.editedFields ?? [];
    const mergedEdited = [...new Set([...existingEdited, "tags"])];

    await db.work.update({
      where: { id: data.workId },
      data: { editedFields: mergedEdited },
    });

    return { success: true };
  });

const tagSuggestionsSchema = z.object({
  query: z.string(),
});

export const getTagSuggestionsServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(tagSuggestionsSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const canonical = data.query.toLowerCase().trim();

    const tags = await db.tag.findMany({
      where: { nameCanonical: { contains: canonical } },
      take: 20,
      orderBy: { name: "asc" },
    });

    return tags.map((t: { id: string; name: string }) => ({
      id: t.id,
      name: t.name,
    }));
  });
