import { z } from "zod";

export const backupManifestSchema = z.object({
  version: z.literal(1),
  timestamp: z.string().datetime(),
  databaseSize: z.number().nonnegative(),
  coverCount: z.number().int().nonnegative(),
  coverSize: z.number().nonnegative(),
});

export type BackupManifest = z.infer<typeof backupManifestSchema>;
