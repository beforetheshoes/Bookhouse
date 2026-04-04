import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getOpdsCredentialsServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const { getCurrentUser } = await import("~/lib/auth-server");

  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return db.opdsCredential.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      username: true,
      isEnabled: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
});

export type OpdsCredentialRow = Awaited<
  ReturnType<typeof getOpdsCredentialsServerFn>
>[number];

const createCredentialSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
});

export const createOpdsCredentialServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(createCredentialSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { hashPassword } = await import("@bookhouse/opds");
    const { getCurrentUser } = await import("~/lib/auth-server");

    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const passwordHash = await hashPassword(data.password);

    return db.opdsCredential.create({
      data: {
        userId: user.id,
        username: data.username,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        isEnabled: true,
        createdAt: true,
      },
    });
  });

const toggleCredentialSchema = z.object({
  credentialId: z.string().min(1),
  isEnabled: z.boolean(),
});

export const toggleOpdsCredentialServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(toggleCredentialSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    return db.opdsCredential.update({
      where: { id: data.credentialId },
      data: { isEnabled: data.isEnabled },
      select: {
        id: true,
        username: true,
        isEnabled: true,
        createdAt: true,
      },
    });
  });

const deleteCredentialSchema = z.object({
  credentialId: z.string().min(1),
});

export const deleteOpdsCredentialServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(deleteCredentialSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    return db.opdsCredential.delete({
      where: { id: data.credentialId },
    });
  });
