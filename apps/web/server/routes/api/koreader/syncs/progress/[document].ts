import { defineEventHandler, createError } from "h3";
import type { H3Event } from "h3";
import type { KoreaderAuthResult } from "../../auth-helper";
import { resolveKoreaderTimestamp, type CandidateEditionFile, type KoreaderResolvedDocument } from "../shared";

export interface KoreaderProgressGetDeps {
  auth: (event: H3Event) => Promise<KoreaderAuthResult>;
  resolveDocument: (userId: string, document: string) => Promise<KoreaderResolvedDocument | null>;
  findProgress: (userId: string, editionId: string) => Promise<{
    percent: number | null;
    locator: { koreader?: { document: string; progress: string; percentage: number; device: string; deviceId: string } };
    updatedAt: Date;
  } | null>;
}

export function createKoreaderProgressGetHandler(deps: KoreaderProgressGetDeps) {
  return async (event: H3Event) => {
    const auth = await deps.auth(event);
    const documentParam = (event.context.params as Record<string, string> | undefined)?.document;
    if (!documentParam) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        message: "Missing document",
      });
    }

    const document = await deps.resolveDocument(auth.userId, documentParam);
    if (!document) {
      throw createError({
        statusCode: 404,
        statusMessage: "Not Found",
        message: "Unknown document",
      });
    }

    const progress = await deps.findProgress(auth.userId, document.editionId);
    if (!progress?.locator.koreader) {
      throw createError({
        statusCode: 404,
        statusMessage: "Not Found",
        message: "No KOReader progress found",
      });
    }

    return {
      document: progress.locator.koreader.document,
      progress: progress.locator.koreader.progress,
      percentage: progress.locator.koreader.percentage,
      device: progress.locator.koreader.device,
      device_id: progress.locator.koreader.deviceId,
      timestamp: Math.floor(resolveKoreaderTimestamp(undefined, progress.updatedAt).getTime() / 1000),
    };
  };
}

export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { verifyPassword } = await import("@bookhouse/opds");
  const { createKoreaderAuth } = await import("../../auth-helper");
  const { resolveKoreaderDocument } = await import("../shared");

  const handler = createKoreaderProgressGetHandler({
    auth: createKoreaderAuth({
      findCredentialByUsername: (username) =>
        db.koreaderCredential.findUnique({ where: { username } }),
      verifyPassword,
    }),
    resolveDocument: (_userId, document) => resolveKoreaderDocument({
      document,
      findExactCandidates: () =>
        db.editionFile.findMany({
          where: {
            fileAsset: {
              koreaderHash: document.toLowerCase(),
              availabilityStatus: "PRESENT",
              mediaKind: { in: ["EPUB", "KEPUB"] },
            },
          },
          include: {
            fileAsset: {
              select: {
                id: true,
                absolutePath: true,
                availabilityStatus: true,
                basename: true,
                mediaKind: true,
                koreaderHash: true,
              },
            },
          },
        }) as Promise<CandidateEditionFile[]>,
      findUnhashedCandidates: () =>
        db.editionFile.findMany({
          where: {
            fileAsset: {
              koreaderHash: null,
              availabilityStatus: "PRESENT",
              mediaKind: { in: ["EPUB", "KEPUB"] },
            },
          },
          include: {
            fileAsset: {
              select: {
                id: true,
                absolutePath: true,
                availabilityStatus: true,
                basename: true,
                mediaKind: true,
                koreaderHash: true,
              },
            },
          },
        }) as Promise<CandidateEditionFile[]>,
      updateFileAssetHash: async (fileAssetId, koreaderHash) => {
        await db.fileAsset.update({
          where: { id: fileAssetId },
          data: { koreaderHash },
        });
      },
    }),
    findProgress: (userId, editionId) =>
      db.readingProgress.findFirst({
        where: { userId, editionId, progressKind: "EBOOK", source: "koreader" },
        select: {
          percent: true,
          locator: true,
          updatedAt: true,
        },
      }) as Promise<{
        percent: number | null;
        locator: { koreader?: { document: string; progress: string; percentage: number; device: string; deviceId: string } };
        updatedAt: Date;
      } | null>,
  });

  return handler(event);
});
