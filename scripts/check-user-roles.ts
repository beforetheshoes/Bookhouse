/**
 * Diagnostic: prints all users + their roles + their identities.
 * Run with: pnpm --filter @bookhouse/db exec tsx ../../scripts/check-user-roles.ts
 * Or from the repo root with the .env loaded.
 */
import { db } from "@bookhouse/db";

async function main(): Promise<void> {
  const users = await db.user.findMany({
    include: {
      roles: { select: { role: true } },
      identities: {
        select: { provider: true, providerAccountId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${users.length} user(s):\n`);

  for (const u of users) {
    console.log(`  id:        ${u.id}`);
    console.log(`  email:     ${u.email ?? "(null)"}`);
    console.log(`  name:      ${u.name ?? "(null)"}`);
    console.log(`  createdAt: ${u.createdAt.toISOString()}`);
    console.log(`  roles:     ${u.roles.map((r) => r.role).join(", ") || "(none)"}`);
    for (const i of u.identities) {
      console.log(`  identity:  provider=${i.provider} sub=${i.providerAccountId}`);
    }
    console.log("");
  }

  const allowed = await db.allowedEmail.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`AllowedEmail entries: ${allowed.length}`);
  for (const a of allowed) {
    console.log(`  - ${a.email}`);
  }

  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
