/** Prisma's code for "the row this write needed was not there". */
export const PRISMA_RECORD_NOT_FOUND = "P2025";

/**
 * Only the existence check. Narrow on purpose: this reads whether the row is
 * still there, never what is in it.
 */
interface FileAssetLookup {
  fileAsset: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
  };
}

/** Structurally what this needs from a logger: one string field, one message. */
interface SkipLogger {
  info: (context: Record<string, string>, message: string) => void;
}

interface SkipIfVanishedOptions<T> {
  db: FileAssetLookup;
  logger?: SkipLogger;
  fileAssetId: string;
  /** Completes "Skipping <label> for file asset deleted mid-job". */
  label: string;
  /** The job body. */
  run: () => Promise<T>;
  /** What the job returns when its subject turned out to be gone. */
  onVanished: () => T;
}

/**
 * Runs a queued job, treating "the file asset it was about has been deleted"
 * as a skip rather than a failure.
 *
 * Every job in this package has the same shape: read a FileAsset, do slow work
 * (hashing, parsing, image decoding, matching), then write. None of them holds
 * a lock across that gap, so deleting a work or a library root part-way
 * through - by hand, or in a test truncating between specs - makes the write
 * raise P2025 and fails a job nobody is waiting on any more.
 *
 * The asset is re-read before the error is tolerated, so a P2025 with the row
 * still in place stays a real failure rather than a silently successful job.
 * That re-read is the whole point: without it this would swallow genuine
 * write failures against other tables.
 *
 * Four jobs were fixed one at a time before this existed - hash, parse, cover
 * and match - which is four chances to write the fifth without a guard. Reach
 * for this when adding one.
 */
export async function skipIfFileAssetVanished<T>(
  options: SkipIfVanishedOptions<T>,
): Promise<T> {
  const { db, logger, fileAssetId, label, run, onVanished } = options;
  try {
    return await run();
  } catch (error) {
    // Object() rather than a typeof/null/in chain: a catch parameter can be
    // any value, and this reads .code off all of them without branching on
    // shapes no test can produce without throwing a non-Error.
    const { code } = Object(error) as { code?: string };
    if (code !== PRISMA_RECORD_NOT_FOUND) {
      throw error;
    }
    const stillThere = await db.fileAsset.findUnique({ where: { id: fileAssetId } });
    if (stillThere !== null) {
      throw error;
    }
    logger?.info({ fileAssetId }, `Skipping ${label} for file asset deleted mid-job`);
    return onVanished();
  }
}
