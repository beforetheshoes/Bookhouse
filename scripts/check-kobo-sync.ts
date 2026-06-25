/**
 * Diagnostic: explains why a Kobo device syncs 0 books.
 * Prints the device, its owner, its linked collections (shelves), and every
 * collection with its owner + item count so ownership mismatches are obvious.
 *
 * Run with: pnpm --filter @bookhouse/db exec tsx ../../scripts/check-kobo-sync.ts
 * Optionally pass a device id or auth token as the first arg.
 */
import { db } from "@bookhouse/db";

async function main(): Promise<void> {
  const needle = process.argv[2] ?? null;

  const devices = await db.koboDevice.findMany({
    where: needle
      ? { OR: [{ id: needle }, { authToken: needle }] }
      : undefined,
    include: {
      user: { select: { id: true, email: true } },
      collections: {
        include: {
          collection: {
            select: {
              id: true,
              name: true,
              ownerUserId: true,
              _count: { select: { items: true } },
            },
          },
        },
      },
      _count: { select: { syncedBooks: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Kobo devices: ${devices.length}\n`);
  for (const d of devices) {
    console.log(`  device.id:   ${d.id}`);
    console.log(`  deviceId:    ${d.deviceId}`);
    console.log(`  authToken:   ${d.authToken}`);
    console.log(`  status:      ${d.status}`);
    console.log(`  userId:      ${d.userId}  (${d.user.email ?? "no email"})`);
    console.log(`  syncedBooks: ${d._count.syncedBooks}`);
    console.log(`  linked collections (${d.collections.length}):`);
    for (const link of d.collections) {
      const c = link.collection;
      console.log(
        `    - ${c.name} [${c.id}] items=${c._count.items} ownerUserId=${c.ownerUserId ?? "(null)"}`,
      );
    }
    console.log("");
  }

  const collections = await db.collection.findMany({
    include: {
      ownerUser: { select: { email: true } },
      _count: { select: { items: true } },
    },
    orderBy: { name: "asc" },
  });

  console.log(`All collections (shelves): ${collections.length}`);
  for (const c of collections) {
    console.log(
      `  - ${c.name} [${c.id}] items=${c._count.items} ownerUserId=${c.ownerUserId ?? "(null)"} (${c.ownerUser?.email ?? "no owner"})`,
    );
  }

  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
