/**
 * Foreign-key existence guards.
 *
 * Sync surfaces (Kobo, KOReader) accept entity ids supplied by a remote device
 * and then write rows that reference them. Between the device's read and our
 * write the referenced row can be deleted, which turns a naive write into a
 * P2003 foreign-key failure (a 500 to the device). These guards centralise the
 * "does this row still exist?" check so the skip-silently-never-throw rule
 * documented in `docs/DATA_MODEL.md` is applied consistently across writers.
 *
 * Each guard takes the Prisma client (or a narrow subset of it) as a parameter
 * so it can be unit-tested without a live database.
 */

/** Minimal client surface needed to check that an Edition row exists. */
export interface EditionExistsClient {
  edition: {
    findUnique(args: {
      where: { id: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

/**
 * Resolve whether an Edition row still exists. Returns `false` rather than
 * throwing so callers can acknowledge-and-skip a write that references a
 * since-deleted edition.
 */
export async function editionExists(
  db: EditionExistsClient,
  editionId: string,
): Promise<boolean> {
  const edition = await db.edition.findUnique({
    where: { id: editionId },
    select: { id: true },
  });
  return edition !== null;
}

/** Thrown by {@link assertEditionExists} when the edition is gone. */
export class MissingEditionError extends Error {
  constructor(public readonly editionId: string) {
    super(`Edition ${editionId} does not exist`);
    this.name = "MissingEditionError";
  }
}

/**
 * Throw {@link MissingEditionError} when the edition no longer exists. Use this
 * where a missing edition is a genuine error the caller wants to branch on,
 * rather than the silent-skip path that {@link editionExists} enables.
 */
export async function assertEditionExists(
  db: EditionExistsClient,
  editionId: string,
): Promise<void> {
  if (!(await editionExists(db, editionId))) {
    throw new MissingEditionError(editionId);
  }
}
