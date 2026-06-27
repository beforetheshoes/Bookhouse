import { db } from "@bookhouse/db";

export async function recordBatchJobProgress(
  importJobId: string,
  isError: boolean,
): Promise<void> {
  await db.importJob.update({
    where: { id: importJobId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      processedFiles: { increment: 1 },
      ...(isError ? { errorCount: { increment: 1 } } : {}),
    },
  });
  const job = await db.importJob.findUnique({
    where: { id: importJobId },
    select: { totalFiles: true, processedFiles: true },
  });
  if (job && job.processedFiles >= job.totalFiles) {
    await db.importJob.update({
      where: { id: importJobId },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });
  }
}
