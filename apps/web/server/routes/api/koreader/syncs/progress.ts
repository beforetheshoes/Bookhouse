import { defineEventHandler, readBody, createError } from "h3";
import type { H3Event } from "h3";
import type { Prisma } from "@bookhouse/db";
import type { KoreaderAuthResult } from "../auth-helper";
import { isForeignKeyConstraintError } from "@bookhouse/shared";
import { resolveKoreaderTimestamp, type CandidateEditionFile, type KoreaderResolvedDocument } from "./shared";
import { z } from "zod";

export interface KoreaderProgressPutDeps {
  auth: (event: H3Event) => Promise<KoreaderAuthResult>;
  readBody: (event: H3Event) => Promise<{
    document?: string;
    progress?: string;
    percentage?: number;
    device?: string;
    device_id?: string;
    timestamp?: number;
  }>;
  resolveDocument: (userId: string, document: string) => Promise<KoreaderResolvedDocument | null>;
  findExistingProgress: (userId: string, editionId: string) => Promise<{ updatedAt: Date } | null>;
  upsertProgress: (input: {
    userId: string;
    editionId: string;
    percent: number;
    progress: string;
    device: string;
    deviceId: string;
    document: string;
    timestamp: Date;
  }) => Promise<{ updatedAt: Date }>;
  now: () => Date;
}

const koreaderProgressSchema = z.object({
  document: z.string(),
  progress: z.string(),
  percentage: z.number(),
  device: z.string(),
  device_id: z.string(),
  // An invalid/NaN device timestamp is tolerated and falls back to the server
  // clock downstream (resolveKoreaderTimestamp), so coerce it to undefined
  // rather than rejecting the whole request.
  timestamp: z.number().optional().catch(undefined),
});

export function createKoreaderProgressPutHandler(deps: KoreaderProgressPutDeps) {
  return async (event: H3Event) => {
    const auth = await deps.auth(event);
    const parsed = koreaderProgressSchema.safeParse(await deps.readBody(event));
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        message: "Invalid KOReader progress payload",
      });
    }
    const body = parsed.data;

    const document = await deps.resolveDocument(auth.userId, body.document);
    if (!document) {
      throw createError({
        statusCode: 404,
        statusMessage: "Not Found",
        message: "Unknown document",
      });
    }

    const existing = await deps.findExistingProgress(auth.userId, document.editionId);
    const deviceTimestamp = resolveKoreaderTimestamp(body.timestamp, deps.now());

    if (!existing || deviceTimestamp.getTime() >= existing.updatedAt.getTime()) {
      try {
        const saved = await deps.upsertProgress({
          userId: auth.userId,
          editionId: document.editionId,
          percent: body.percentage,
          progress: body.progress,
          device: body.device,
          deviceId: body.device_id,
          document: body.document,
          timestamp: deviceTimestamp,
        });

        return {
          document: body.document,
          timestamp: Math.floor(saved.updatedAt.getTime() / 1000),
        };
      } catch (error) {
        // The edition can be deleted between document resolution and this write.
        // Acknowledge with the device's own timestamp instead of 500ing (a
        // successful response stops KOReader retrying). Re-throw non-FK errors.
        if (!isForeignKeyConstraintError(error as Error)) {
          throw error;
        }
        console.warn(
          `[koreader] progress skipped: edition removed mid-sync (${document.editionId})`,
          error,
        );
        return {
          document: body.document,
          timestamp: Math.floor(deviceTimestamp.getTime() / 1000),
        };
      }
    }

    return {
      document: body.document,
      timestamp: Math.floor(existing.updatedAt.getTime() / 1000),
    };
  };
}

export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { verifyPassword } = await import("@bookhouse/opds");
  const { createKoreaderAuth } = await import("../auth-helper");
  const { resolveKoreaderDocument } = await import("./shared");

  const handler = createKoreaderProgressPutHandler({
    auth: createKoreaderAuth({
      findCredentialByUsername: (username) =>
        db.koreaderCredential.findUnique({ where: { username } }),
      verifyPassword,
    }),
    readBody: async (ev) => (await readBody(ev)) ?? {},
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
    findExistingProgress: (userId, editionId) =>
      db.readingProgress.findFirst({
        where: { userId, editionId, progressKind: "EBOOK", source: "koreader" },
        select: { updatedAt: true },
      }),
    upsertProgress: ({ userId, editionId, percent, progress, device, deviceId, document, timestamp }) => {
      const locator = {
        koreader: {
          document,
          progress,
          percentage: percent,
          device,
          deviceId,
        },
      } as Prisma.InputJsonValue;

      // Atomic upsert on the per-source unique key — avoids the find-then-create
      // race and never touches a kobo/manual row for the same edition.
      return db.readingProgress.upsert({
        where: {
          userId_editionId_progressKind_source: {
            userId,
            editionId,
            progressKind: "EBOOK",
            source: "koreader",
          },
        },
        create: {
          userId,
          editionId,
          progressKind: "EBOOK",
          percent,
          locator,
          source: "koreader",
          updatedAt: timestamp,
        },
        update: { percent, locator, updatedAt: timestamp },
        select: { updatedAt: true },
      });
    },
    now: () => new Date(),
  });

  return handler(event);
});
