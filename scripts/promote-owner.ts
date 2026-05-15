/**
 * Promotes the user with the given email to OWNER role. Idempotent.
 *
 * Usage:
 *   pnpm --filter @bookhouse/web exec tsx ../../scripts/promote-owner.ts <email>
 *
 * Optional second argument: --delete-others to remove all other users (use
 * with care — cascade-deletes their shelves, reading progress, devices, etc.).
 */
import { db } from "@bookhouse/db";

async function main(): Promise<void> {
  const email = process.argv[2];
  const deleteOthers = process.argv[3] === "--delete-others";

  if (!email) {
    console.error("Usage: promote-owner.ts <email> [--delete-others]");
    process.exit(1);
  }

  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({
    where: { email: normalized },
    include: { roles: { select: { role: true } } },
  });

  if (!user) {
    // Try case-insensitive fallback in case existing rows weren't normalized.
    const candidates = await db.user.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (candidates.length === 0) {
      console.error(`No user found with email ${email}`);
      process.exit(1);
    }
    if (candidates.length > 1) {
      console.error(
        `Multiple users found with email ${email} (case-insensitive). Pick one and run with that exact casing.`,
      );
      for (const c of candidates) {
        console.error(`  - ${c.id}  ${c.email}`);
      }
      process.exit(1);
    }
    console.log(
      `Using case-insensitive match: ${candidates[0]!.email} (${candidates[0]!.id})`,
    );
  }

  const target = user ?? (await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { roles: { select: { role: true } } },
  }))!;

  if (target.roles.some((r) => r.role === "OWNER")) {
    console.log(`${target.email} already has OWNER role.`);
  } else {
    await db.userRole.create({
      data: { userId: target.id, role: "OWNER" },
    });
    console.log(`Promoted ${target.email} to OWNER.`);
  }

  if (deleteOthers) {
    const others = await db.user.findMany({
      where: { id: { not: target.id } },
      select: { id: true, email: true },
    });
    for (const o of others) {
      await db.user.delete({ where: { id: o.id } });
      console.log(`Deleted user ${o.email ?? o.id}`);
    }
  }

  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
