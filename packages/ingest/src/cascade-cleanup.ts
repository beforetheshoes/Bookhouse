export interface CascadeCleanupInput {
  fileAssetIds: string[];
}

export interface CascadeCleanupResult {
  deletedEditionFileCount: number;
  deletedEditionIds: string[];
  deletedWorkIds: string[];
}

interface CleanupDbClient {
  editionFile: {
    findMany(args: { where: { fileAssetId: { in: string[] } }; select: { id: true; editionId: true } }): Promise<{ id: string; editionId: string }[]>;
    deleteMany(args: { where: { fileAssetId: { in: string[] } } }): Promise<{ count: number }>;
    count(args: { where: { editionId: string } }): Promise<number>;
  };
  fileAsset: {
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
  };
  duplicateCandidate: {
    deleteMany(args: { where: { OR: Record<string, unknown>[] } }): Promise<{ count: number }>;
  };
  edition: {
    findMany(args: { where: { id: { in: string[] } }; select: { id: true; workId: true } }): Promise<{ id: string; workId: string }[]>;
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
    count(args: { where: { workId: string } }): Promise<number>;
  };
  work: {
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
  };
}

export async function cascadeCleanupOrphans(
  db: CleanupDbClient,
  input: CascadeCleanupInput,
): Promise<CascadeCleanupResult> {
  if (input.fileAssetIds.length === 0) {
    return { deletedEditionFileCount: 0, deletedEditionIds: [], deletedWorkIds: [] };
  }

  // 1. Find EditionFiles referencing these FileAssets (to get editionIds)
  const affectedEditionFiles = await db.editionFile.findMany({
    where: { fileAssetId: { in: input.fileAssetIds } },
    select: { id: true, editionId: true },
  });
  const affectedEditionIds = [...new Set(affectedEditionFiles.map((ef) => ef.editionId))];

  // 2. Delete EditionFiles
  const { count: deletedEditionFileCount } = await db.editionFile.deleteMany({
    where: { fileAssetId: { in: input.fileAssetIds } },
  });

  // 3. Clean up DuplicateCandidates referencing these FileAssets
  await db.duplicateCandidate.deleteMany({
    where: {
      OR: [
        { leftFileAssetId: { in: input.fileAssetIds } },
        { rightFileAssetId: { in: input.fileAssetIds } },
      ],
    },
  });

  // 4. Delete the FileAssets themselves
  await db.fileAsset.deleteMany({
    where: { id: { in: input.fileAssetIds } },
  });

  // 5. Find Editions that now have zero EditionFiles
  const emptyEditionIds: string[] = [];
  for (const editionId of affectedEditionIds) {
    const remaining = await db.editionFile.count({ where: { editionId } });
    if (remaining === 0) {
      emptyEditionIds.push(editionId);
    }
  }

  if (emptyEditionIds.length === 0) {
    return { deletedEditionFileCount, deletedEditionIds: [], deletedWorkIds: [] };
  }

  // 6. Get workIds before deleting Editions
  const editionsToDelete = await db.edition.findMany({
    where: { id: { in: emptyEditionIds } },
    select: { id: true, workId: true },
  });
  const affectedWorkIds = [...new Set(editionsToDelete.map((e) => e.workId))];
  const deletedEditionIds = editionsToDelete.map((e) => e.id);

  // 7. Clean up DuplicateCandidates referencing these Editions
  await db.duplicateCandidate.deleteMany({
    where: {
      OR: [
        { leftEditionId: { in: emptyEditionIds } },
        { rightEditionId: { in: emptyEditionIds } },
      ],
    },
  });

  // 8. Delete empty Editions (cascade handles EditionContributors, ReadingProgress, ExternalLinks)
  await db.edition.deleteMany({
    where: { id: { in: emptyEditionIds } },
  });

  // 9. Find Works that now have zero Editions
  const emptyWorkIds: string[] = [];
  for (const workId of affectedWorkIds) {
    const remaining = await db.edition.count({ where: { workId } });
    if (remaining === 0) {
      emptyWorkIds.push(workId);
    }
  }

  if (emptyWorkIds.length > 0) {
    // 10. Delete empty Works (cascade handles CollectionItems, AudioLinks)
    await db.work.deleteMany({
      where: { id: { in: emptyWorkIds } },
    });
  }

  return { deletedEditionFileCount, deletedEditionIds, deletedWorkIds: emptyWorkIds };
}
