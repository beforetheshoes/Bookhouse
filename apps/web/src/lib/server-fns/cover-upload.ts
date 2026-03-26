import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const uploadCoverSchema = z.object({
  workId: z.string().min(1),
  imageBase64: z.string(),
});

export const uploadCoverServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(uploadCoverSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { resizeCoverImage } = await import("@bookhouse/ingest");
    const path = await import("node:path");
    const { mkdir, writeFile } = await import("node:fs/promises");
    // @ts-expect-error — sharp is a native module resolved at runtime
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const sharp = (await import("sharp")).default;

    if (data.imageBase64 === "") {
      throw new Error("No image data provided");
    }

    const coverCacheDir = process.env.COVER_CACHE_DIR ?? "/data/covers";
    const imageBuffer = Buffer.from(data.imageBase64, "base64");
    const outputDir = path.join(coverCacheDir, data.workId);

    await resizeCoverImage(
      { imageBuffer, outputDir },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      { sharp, mkdir, writeFile },
    );

    const work = await db.work.findUnique({
      where: { id: data.workId },
      select: { editedFields: true },
    });

    const existingEdited = work?.editedFields ?? [];
    const mergedEdited = [...new Set([...existingEdited, "coverPath"])];

    await db.work.update({
      where: { id: data.workId },
      data: {
        coverPath: data.workId,
        editedFields: mergedEdited,
      },
    });

    return { success: true };
  });
