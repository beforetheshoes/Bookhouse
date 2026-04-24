import { hashFileContents } from "@bookhouse/ingest";
import { selectPreferredKoboDeliveryFile } from "@bookhouse/shared";

export interface KoreaderResolvedDocument {
  document: string;
  editionId: string;
  fileAssetId: string;
}

export interface CandidateEditionFile {
  id: string;
  editionId: string;
  role: string;
  fileAsset: {
    id: string;
    absolutePath: string;
    availabilityStatus: string;
    basename: string;
    mediaKind: string;
    koreaderHash: string | null;
  };
}

interface ResolveKoreaderDocumentDeps {
  findExactCandidates: () => Promise<CandidateEditionFile[]>;
  findUnhashedCandidates: () => Promise<CandidateEditionFile[]>;
  updateFileAssetHash: (fileAssetId: string, koreaderHash: string) => Promise<void>;
  document: string;
}

function pickMatch(document: string, editionFiles: CandidateEditionFile[]): KoreaderResolvedDocument | null {
  const byEdition = new Map<string, CandidateEditionFile[]>();

  for (const editionFile of editionFiles) {
    const list = byEdition.get(editionFile.editionId) ?? [];
    list.push(editionFile);
    byEdition.set(editionFile.editionId, list);
  }

  for (const [editionId, candidates] of byEdition.entries()) {
    const preferred = selectPreferredKoboDeliveryFile(candidates.map((editionFile) => ({
      id: editionFile.id,
      role: editionFile.role,
      fileAsset: {
        basename: editionFile.fileAsset.basename,
        mediaKind: editionFile.fileAsset.mediaKind,
      },
    })));

    const matched = candidates.find((candidate) => candidate.id === preferred?.id);
    if (matched?.fileAsset.koreaderHash?.toLowerCase() === document.toLowerCase()) {
      return {
        document,
        editionId,
        fileAssetId: matched.fileAsset.id,
      };
    }
  }

  return null;
}

export async function resolveKoreaderDocument(
  deps: ResolveKoreaderDocumentDeps,
): Promise<KoreaderResolvedDocument | null> {
  const exactCandidates = await deps.findExactCandidates();

  const exactMatch = pickMatch(deps.document, exactCandidates);
  if (exactMatch) {
    return exactMatch;
  }

  const unhashedCandidates = await deps.findUnhashedCandidates();

  const seenFileAssetIds = new Set<string>();
  for (const candidate of unhashedCandidates) {
    if (seenFileAssetIds.has(candidate.fileAsset.id)) continue;
    seenFileAssetIds.add(candidate.fileAsset.id);
    const hashes = await hashFileContents(candidate.fileAsset.absolutePath);
    candidate.fileAsset.koreaderHash = hashes.koreaderHash;
    await deps.updateFileAssetHash(candidate.fileAsset.id, hashes.koreaderHash);
  }

  return pickMatch(deps.document, unhashedCandidates);
}

export function resolveKoreaderTimestamp(timestamp: number | undefined, fallback: Date): Date {
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return fallback;
  }

  return new Date(timestamp * 1000);
}
