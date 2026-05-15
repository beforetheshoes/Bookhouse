import type { PrismaClient } from "@bookhouse/db";

export const OWNER_ROLE = "OWNER";
export const VIEWER_ROLE = "VIEWER";

type RoleQueryClient = Pick<PrismaClient, "userRole">;

export async function getUserRoles(
  db: RoleQueryClient,
  userId: string,
): Promise<string[]> {
  const rows = await db.userRole.findMany({
    where: { userId },
    select: { role: true },
  });

  return rows.map((row) => row.role);
}

export async function hasRole(
  db: RoleQueryClient,
  userId: string,
  role: string,
): Promise<boolean> {
  const row = await db.userRole.findUnique({
    where: { userId_role: { userId, role } },
    select: { id: true },
  });

  return row !== null;
}

export function isOwner(roles: readonly string[]): boolean {
  return roles.includes(OWNER_ROLE);
}
