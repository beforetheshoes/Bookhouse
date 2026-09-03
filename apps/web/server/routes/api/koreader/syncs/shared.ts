import { hashKoreaderDocument } from "@bookhouse/ingest";
import { createLogger, selectPreferredKoboDeliveryFile } from "@bookhouse/shared";

const logger = createLogger("koreader");

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

  // Backfill lazily. The partial digest reads at most twelve 1 KiB samples
  // per file, so even a large library clears in one request. A file that has
  // gone missing since the scan just stays unhashed rather than failing the
  // whole sync request.
  const hashByFileAssetId = new Map<string, string | null>();
  for (const candidate of unhashedCandidates) {
    let koreaderHash = hashByFileAssetId.get(candidate.fileAsset.id);
    if (koreaderHash === undefined) {
      try {
        koreaderHash = await hashKoreaderDocument(candidate.fileAsset.absolutePath);
        await deps.updateFileAssetHash(candidate.fileAsset.id, koreaderHash);
      } catch (error) {
        logger.warn(
          { err: error, fileAssetId: candidate.fileAsset.id, absolutePath: candidate.fileAsset.absolutePath },
          "Could not compute KOReader document hash",
        );
        koreaderHash = null;
      }
      hashByFileAssetId.set(candidate.fileAsset.id, koreaderHash);
    }
    candidate.fileAsset.koreaderHash = koreaderHash;
  }

  return pickMatch(deps.document, unhashedCandidates);
}

export function resolveKoreaderTimestamp(timestamp: number | undefined, fallback: Date): Date {
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return fallback;
  }

  return new Date(timestamp * 1000);
}
