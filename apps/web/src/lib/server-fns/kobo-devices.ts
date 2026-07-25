import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getKoboDevicesServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const user = await (await import("./_guards")).authenticatedOnly();
  const { db } = await import("@bookhouse/db");
  return db.koboDevice.findMany({
    where: { userId: user.id },
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
  .validator(addDeviceSchema)
  .handler(async ({ data }) => {
    const user = await (await import("./_guards")).authenticatedOnly();
    const { db } = await import("@bookhouse/db");
    const { generateAuthToken, generateUserKey } = await import("@bookhouse/kobo");

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

async function requireOwnedKoboDevice(
  db: { koboDevice: { findUnique: (args: { where: { id: string }; select: { userId: true } }) => Promise<{ userId: string } | null> } },
  deviceId: string,
  userId: string,
): Promise<void> {
  const device = await db.koboDevice.findUnique({
    where: { id: deviceId },
    select: { userId: true },
  });
  if (!device || device.userId !== userId) {
    throw new Error("Device not found");
  }
}

export const revokeKoboDeviceServerFn = createServerFn({
  method: "POST",
})
  .validator(revokeDeviceSchema)
  .handler(async ({ data }) => {
    const user = await (await import("./_guards")).authenticatedOnly();
    const { db } = await import("@bookhouse/db");
    await requireOwnedKoboDevice(db, data.deviceId, user.id);
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
  .validator(removeDeviceSchema)
  .handler(async ({ data }) => {
    const user = await (await import("./_guards")).authenticatedOnly();
    const { db } = await import("@bookhouse/db");
    await requireOwnedKoboDevice(db, data.deviceId, user.id);
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
  .validator(updateDeviceCollectionsSchema)
  .handler(async ({ data }) => {
    const user = await (await import("./_guards")).authenticatedOnly();
    const { db } = await import("@bookhouse/db");
    await requireOwnedKoboDevice(db, data.deviceId, user.id);

    // Verify all referenced collections are owned by the user.
    if (data.collectionIds.length > 0) {
      const owned = await db.collection.findMany({
        where: { id: { in: data.collectionIds }, ownerUserId: user.id },
        select: { id: true },
      });
      if (owned.length !== data.collectionIds.length) {
        throw new Error("One or more shelves not found");
      }
    }

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
