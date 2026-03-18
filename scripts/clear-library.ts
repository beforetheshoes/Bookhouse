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

  console.log("Cleared:", deleted.map((d, i) => {
    const names = ["editionFiles", "duplicates", "editions", "works", "fileAssets", "importJobs"];
    return `${names[i]}: ${d.count}`;
  }).join(", "));

  await db.$disconnect();
}

main();
