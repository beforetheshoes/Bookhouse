import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const listUsersServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await (await import("./_guards")).ownerOnly();
  const { db } = await import("@bookhouse/db");
  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      createdAt: true,
      roles: { select: { role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    createdAt: u.createdAt,
    roles: u.roles.map((r) => r.role),
  }));
});

export const listAllowedEmailsServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await (await import("./_guards")).ownerOnly();
  const { db } = await import("@bookhouse/db");
  return db.allowedEmail.findMany({
    orderBy: { createdAt: "desc" },
  });
});

export const addAllowedEmailServerFn = createServerFn({
  method: "POST",
})
  .validator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const owner = await (await import("./_guards")).ownerOnly();
    const { db } = await import("@bookhouse/db");
    const email = normalizeEmail(data.email);
    return db.allowedEmail.upsert({
      where: { email },
      create: { email, createdBy: owner.id },
      update: {},
    });
  });

export const removeAllowedEmailServerFn = createServerFn({
  method: "POST",
})
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await (await import("./_guards")).ownerOnly();
    const { db } = await import("@bookhouse/db");
    try {
      await db.allowedEmail.delete({ where: { id: data.id } });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        return { success: true };
      }
      throw error;
    }
    return { success: true };
  });

export const removeUserServerFn = createServerFn({
  method: "POST",
})
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const owner = await (await import("./_guards")).ownerOnly();
    if (data.userId === owner.id) {
      throw new Error("Cannot remove yourself");
    }
    const { db } = await import("@bookhouse/db");
    await db.user.delete({ where: { id: data.userId } });
    return { success: true };
  });
