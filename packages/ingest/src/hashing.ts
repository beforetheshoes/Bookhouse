import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";

export const PARTIAL_HASH_BYTES = 64 * 1024;
export const KOREADER_SAMPLE_BYTES = 1024;

/**
 * Offsets sampled by KOReader's `util.partialMD5`: byte 0, then
 * `1024 << (2 * i)` for i = 0..10 (1 KiB, 4 KiB, 16 KiB, … 1 GiB), stopping at
 * the first offset at or past the end of the file (where Lua's `read` returns
 * nil and the loop breaks).
 */
export function koreaderSampleOffsets(sizeBytes: number): number[] {
  const offsets = [0];
  for (let exponent = 0; exponent <= 10; exponent += 1) {
    offsets.push(KOREADER_SAMPLE_BYTES * 4 ** exponent);
  }
  return offsets.filter((offset) => offset < sizeBytes);
}

/**
 * The document id KOReader's kosync plugin sends in "binary" matching mode:
 * an MD5 over 1 KiB samples at {@link koreaderSampleOffsets}, not over the
 * whole file. Reproducing it exactly is what lets a device find its book in
 * Bookhouse without any per-device setup.
 */
export async function hashKoreaderDocument(absolutePath: string): Promise<string> {
  const handle = await open(absolutePath, "r");
  try {
    const { size } = await handle.stat();
    const digest = createHash("md5");
    const sample = Buffer.alloc(KOREADER_SAMPLE_BYTES);
    for (const offset of koreaderSampleOffsets(size)) {
      const { bytesRead } = await handle.read(sample, 0, KOREADER_SAMPLE_BYTES, offset);
      digest.update(sample.subarray(0, bytesRead));
    }
    return digest.digest("hex");
  } finally {
    await handle.close();
  }
}

export interface FileHashes {
  fullHash: string;
  koreaderHash: string;
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
    koreaderHash: await hashKoreaderDocument(absolutePath),
    mtime: fileStats.mtime,
    partialHash: partialHash.digest("hex"),
    sizeBytes,
  };
}
