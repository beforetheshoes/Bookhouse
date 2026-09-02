import { db } from "@bookhouse/db";

/**
 * Record one finished child of a batch ImportJob (bulk enrich, author photos).
 *
 * Every write is scoped to a still-live row: a batch the user stopped (or
 * one whose row was deleted) must not be resurrected to RUNNING and then
 * SUCCEEDED by a straggling job, and `startedAt` is set once rather than on
 * every child so the batch duration means something.
 */
export async function recordBatchJobProgress(
  importJobId: string,
  isError: boolean,
): Promise<void> {
  const now = new Date();
  const { count } = await db.importJob.updateMany({
    where: { id: importJobId, status: { in: ["QUEUED", "RUNNING"] } },
    data: {
      status: "RUNNING",
      processedFiles: { increment: 1 },
      ...(isError ? { errorCount: { increment: 1 } } : {}),
    },
  });
  if (count === 0) {
    return;
  }
  await db.importJob.updateMany({
    where: { id: importJobId, startedAt: null },
    data: { startedAt: now },
  });
  const job = await db.importJob.findUnique({
    where: { id: importJobId },
    select: { totalFiles: true, processedFiles: true },
  });
  if (job && job.processedFiles >= job.totalFiles) {
    await db.importJob.updateMany({
      where: { id: importJobId, status: "RUNNING" },
      data: { status: "SUCCEEDED", finishedAt: now },
    });
  }
}
