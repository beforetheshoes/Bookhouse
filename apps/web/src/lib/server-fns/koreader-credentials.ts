import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const credentialSelection = {
  id: true,
  username: true,
  isEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const getKoreaderCredentialServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const { getCurrentUser } = await import("~/lib/auth-server");

  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return db.koreaderCredential.findUnique({
    where: { userId: user.id },
    select: credentialSelection,
  });
});

export type KoreaderCredentialRow = Awaited<
  ReturnType<typeof getKoreaderCredentialServerFn>
>;

const saveCredentialSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
});

export const saveKoreaderCredentialServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(saveCredentialSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { hashPassword } = await import("@bookhouse/opds");
    const { getCurrentUser } = await import("~/lib/auth-server");

    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const passwordHash = await hashPassword(data.password);

    return db.koreaderCredential.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        username: data.username,
        passwordHash,
      },
      update: {
        username: data.username,
        passwordHash,
      },
      select: credentialSelection,
    });
  });

const toggleCredentialSchema = z.object({
  isEnabled: z.boolean(),
});

export const toggleKoreaderCredentialServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(toggleCredentialSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { getCurrentUser } = await import("~/lib/auth-server");

    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    return db.koreaderCredential.update({
      where: { userId: user.id },
      data: { isEnabled: data.isEnabled },
      select: credentialSelection,
    });
  });
