import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getKoboDevicesServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.koboDevice.findMany({
    include: {
      collections: {
        include: { collection: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
});

export type KoboDeviceRow = Awaited<
  ReturnType<typeof getKoboDevicesServerFn>
>[number];

const addDeviceSchema = z.object({
  deviceName: z.string().min(1).max(100),
});

export const addKoboDeviceServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(addDeviceSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { generateAuthToken, generateUserKey } = await import("@bookhouse/kobo");
    const { getCurrentUser } = await import("~/lib/auth-server");

    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const authToken = generateAuthToken();
    const userKey = generateUserKey(user.id, data.deviceName);

    return db.koboDevice.create({
      data: {
        userId: user.id,
        deviceId: data.deviceName,
        authToken,
        userKey,
      },
    });
  });

const revokeDeviceSchema = z.object({
  deviceId: z.string().min(1),
});

export const revokeKoboDeviceServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(revokeDeviceSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.koboDevice.update({
      where: { id: data.deviceId },
      data: { status: "REVOKED" },
    });
  });

const removeDeviceSchema = z.object({
  deviceId: z.string().min(1),
});

export const removeKoboDeviceServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(removeDeviceSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.koboDevice.delete({
      where: { id: data.deviceId },
    });
  });

const updateDeviceCollectionsSchema = z.object({
  deviceId: z.string().min(1),
  collectionIds: z.array(z.string().min(1)),
});

export const updateDeviceCollectionsServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(updateDeviceCollectionsSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    await db.koboDeviceCollection.deleteMany({
      where: { koboDeviceId: data.deviceId },
    });

    if (data.collectionIds.length > 0) {
      await db.koboDeviceCollection.createMany({
        data: data.collectionIds.map((collectionId) => ({
          koboDeviceId: data.deviceId,
          collectionId,
        })),
      });
    }

    return db.koboDeviceCollection.findMany({
      where: { koboDeviceId: data.deviceId },
      include: { collection: { select: { id: true, name: true } } },
    });
  });

