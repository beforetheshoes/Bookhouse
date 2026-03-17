import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export const PARTIAL_HASH_BYTES = 64 * 1024;

export interface FileHashes {
  fullHash: string;
  mtime: Date;
  partialHash: string;
  sizeBytes: bigint;
}

export async function hashFileContents(absolutePath: string): Promise<FileHashes> {
  const fileStats = await stat(absolutePath);
  const sizeBytes = BigInt(fileStats.size);
  const fullHash = createHash("sha256");
  const partialHash = createHash("sha256");
  let partialBytesRead = 0;

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(absolutePath);

    stream.on("data", (chunk: Buffer) => {
      fullHash.update(chunk);

      if (partialBytesRead < PARTIAL_HASH_BYTES) {
        const remainingBytes = PARTIAL_HASH_BYTES - partialBytesRead;
        const partialChunk = chunk.subarray(0, remainingBytes);
        partialHash.update(partialChunk);
        partialBytesRead += partialChunk.length;
      }
    });

    stream.on("end", resolve);
    stream.on("error", reject);
  });

  partialHash.update(":");
  partialHash.update(sizeBytes.toString());

  return {
    fullHash: fullHash.digest("hex"),
    mtime: fileStats.mtime,
    partialHash: partialHash.digest("hex"),
    sizeBytes,
  };
}
