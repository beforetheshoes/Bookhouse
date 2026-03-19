import { db } from "../packages/db/src/index.js";

async function main() {
  const deleted = await db.$transaction([
    db.editionFile.deleteMany(),
    db.duplicateCandidate.deleteMany(),
    db.edition.deleteMany(),
    db.work.deleteMany(),
    db.fileAsset.deleteMany(),
    db.importJob.deleteMany(),
  ]);

  const names = ["editionFiles", "duplicates", "editions", "works", "fileAssets", "importJobs"] as const;
  console.log("Cleared:", deleted.map((d, i) => {
    return `${names[i] ?? "unknown"}: ${String(d.count)}`;
  }).join(", "));

  await db.$disconnect();
}

void main();
