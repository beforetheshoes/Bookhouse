import { defineEventHandler } from "h3";
import type { H3Event } from "h3";
import type { KoboAuthDeps } from "../../../../auth-helper";
import type { EligibleEdition } from "@bookhouse/kobo";
import { selectPreferredKoboDeliveryFile } from "@bookhouse/shared";

export interface MetadataHandlerDeps {
  auth: KoboAuthDeps;
  findEdition: (editionId: string) => Promise<EligibleEdition | null>;
  getBaseUrl: () => string;
}

const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export function createMetadataHandler(deps: MetadataHandlerDeps) {
  return async (event: H3Event) => {
    const { createKoboAuth } = await import("../../../../auth-helper");
    const auth = createKoboAuth(deps.auth);
    const device = await auth(event);

    const params = event.context.params as Record<string, string>;
    const bookId = params.bookId as string;

    if (!VALID_ID.test(bookId)) {
      throw Object.assign(new Error("Invalid bookId"), {
        statusCode: 400,
        statusMessage: "Invalid bookId",
      });
    }

    const edition = await deps.findEdition(bookId);

    if (!edition) {
      return [{}];
    }

    const { buildBookMetadata } = await import("@bookhouse/kobo");
    const baseUrl = deps.getBaseUrl();

    return [
      buildBookMetadata(edition, {
        baseUrl,
        deviceToken: device.authToken,
      }),
    ];
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");

  const handler = createMetadataHandler({
    auth: {
      findDeviceByToken: (token) =>
        db.koboDevice.findUnique({ where: { authToken: token } }),
    },
    findEdition: async (editionId) => {
      const ed = await db.edition.findUnique({
        where: { id: editionId },
        include: {
          work: { include: { series: true } },
          contributors: { include: { contributor: true } },
          editionFiles: {
            include: { fileAsset: true },
          },
        },
      });

      if (!ed) return null;

      const deliveryFile = selectPreferredKoboDeliveryFile(
        ed.editionFiles
          .filter((editionFile) => editionFile.fileAsset.availabilityStatus === "PRESENT")
          .map((editionFile) => ({
            id: editionFile.id,
            role: editionFile.role,
            fileAsset: {
              basename: editionFile.fileAsset.basename,
              mediaKind: editionFile.fileAsset.mediaKind,
            },
          })),
      );
      const selectedEditionFile = ed.editionFiles.find((editionFile) => editionFile.id === deliveryFile?.id) ?? null;
      const deliveryFileAsset = selectedEditionFile?.fileAsset ?? null;

      return {
        id: ed.id,
        workId: ed.workId,
        title: ed.work.titleDisplay,
        description: ed.work.description,
        coverPath: ed.work.coverPath,
        publisher: ed.publisher,
        publishedAt: ed.publishedAt,
        isbn13: ed.isbn13,
        language: ed.language,
        pageCount: ed.pageCount,
        seriesName: ed.work.series?.name ?? null,
        seriesPosition: ed.work.seriesPosition,
        contributors: ed.contributors.map((c) => ({
          name: c.contributor.nameDisplay,
          role: c.role,
        })),
        deliveryFilePath: deliveryFileAsset?.absolutePath ?? null,
        deliveryFileSize: deliveryFileAsset?.sizeBytes ? Number(deliveryFileAsset.sizeBytes) : null,
        deliveryFileMimeType: deliveryFileAsset?.mimeType ?? null,
        deliveryFileMediaKind: deliveryFileAsset?.mediaKind ?? null,
      };
    },
    getBaseUrl: () => process.env.KOBO_API_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000",
  });

  return handler(event);
});
/* c8 ignore stop */
