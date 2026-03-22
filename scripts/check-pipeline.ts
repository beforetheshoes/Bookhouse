import { db } from "@bookhouse/db";

async function main() {
  // Check hash status of sidecars
  const totalSidecars = await db.fileAsset.count({
    where: { mediaKind: "SIDECAR", absolutePath: { endsWith: "metadata.json" } },
  });
  const hashedSidecars = await db.fileAsset.count({
    where: { mediaKind: "SIDECAR", absolutePath: { endsWith: "metadata.json" }, fullHash: { not: null } },
  });
  const totalAudio = await db.fileAsset.count({ where: { mediaKind: "AUDIO" } });
  const hashedAudio = await db.fileAsset.count({ where: { mediaKind: "AUDIO", fullHash: { not: null } } });

  console.log("Hashing progress:");
  console.log(`  Sidecars: ${hashedSidecars}/${totalSidecars}`);
  console.log(`  Audio: ${hashedAudio}/${totalAudio}`);

  // Check parsed sidecars
  const parsedSidecars = await db.fileAsset.count({
    where: {
      mediaKind: "SIDECAR",
      absolutePath: { endsWith: "metadata.json" },
      metadata: { path: ["status"], equals: "parsed" },
    },
  });
  console.log(`  Parsed sidecars: ${parsedSidecars}/${totalSidecars}`);

  // Check a hashed sidecar's metadata
  const hashedSample = await db.fileAsset.findFirst({
    where: { mediaKind: "SIDECAR", absolutePath: { endsWith: "metadata.json" }, fullHash: { not: null } },
    select: { id: true, absolutePath: true, metadata: true },
  });
  if (hashedSample) {
    console.log("\nSample hashed sidecar:");
    console.log("  path:", hashedSample.absolutePath);
    const metaStr = JSON.stringify(hashedSample.metadata);
    console.log("  metadata:", metaStr ? metaStr.substring(0, 300) : "null");
  }

  // Audiobook status
  const audioEditions = await db.edition.count({ where: { formatFamily: "AUDIOBOOK" } });
  const stubWorks = await db.work.count({
    where: { enrichmentStatus: "STUB", editions: { some: { formatFamily: "AUDIOBOOK" } } },
  });
  const enrichedAudioWorks = await db.work.count({
    where: { enrichmentStatus: "ENRICHED", editions: { some: { formatFamily: "AUDIOBOOK" } } },
  });
  const linkedWorks = await db.work.count({
    where: {
      AND: [
        { editions: { some: { formatFamily: "AUDIOBOOK" } } },
        { editions: { some: { formatFamily: "EBOOK" } } },
      ],
    },
  });
  const audioLinks = await db.audioLink.count();

  console.log("\n--- Audiobook Status ---");
  console.log("Editions:", audioEditions);
  console.log("Stub works:", stubWorks);
  console.log("Enriched works:", enrichedAudioWorks);
  console.log("Linked works (audio+ebook):", linkedWorks);
  console.log("Audio links:", audioLinks);

  if (enrichedAudioWorks > 0) {
    const samples = await db.work.findMany({
      where: { enrichmentStatus: "ENRICHED", editions: { some: { formatFamily: "AUDIOBOOK" } } },
      take: 3,
      select: {
        titleDisplay: true,
        editions: {
          select: {
            formatFamily: true,
            contributors: {
              select: { contributor: { select: { nameDisplay: true } }, role: true },
            },
          },
        },
      },
    });
    console.log("\nSample enriched:");
    for (const w of samples) {
      const formats = [...new Set(w.editions.map((e) => e.formatFamily))];
      const authors = [...new Set(w.editions.flatMap((e) =>
        e.contributors.filter((c) => c.role === "AUTHOR").map((c) => c.contributor.nameDisplay),
      ))];
      console.log(`  ${w.titleDisplay} | ${formats.join("+")} | ${authors.join(", ") || "NONE"}`);
    }
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
