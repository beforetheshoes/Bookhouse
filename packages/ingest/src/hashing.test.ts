import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PARTIAL_HASH_BYTES, hashFileContents } from "./index";
import { KOREADER_SAMPLE_BYTES, hashKoreaderDocument, koreaderSampleOffsets } from "./hashing";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.map(async (directory) => {
      await import("node:fs/promises").then(({ rm }) =>
        rm(directory, { force: true, recursive: true }),
      );
    }),
  );
  tempDirectories.length = 0;
});

describe("hashFileContents", () => {
  it("computes full and partial hashes using the first 64 KiB plus file size", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-hash-"));
    tempDirectories.push(directory);

    const filePath = path.join(directory, "book.epub");
    const fileContents = Buffer.alloc(PARTIAL_HASH_BYTES + 32, "a");
    await writeFile(filePath, fileContents);

    const result = await hashFileContents(filePath);
    const expectedFullHash = createHash("sha256").update(fileContents).digest("hex");
    const expectedPartialHash = createHash("sha256")
      .update(fileContents.subarray(0, PARTIAL_HASH_BYTES))
      .update(":")
      .update(fileContents.length.toString())
      .digest("hex");
    // KOReader's partialMD5: 1 KiB at 0, 1 KiB, 4 KiB, 16 KiB and 64 KiB; the
    // next sample offset (256 KiB) is past the end of this file.
    const expectedKoreaderHash = createHash("md5")
      .update(fileContents.subarray(0, 1024))
      .update(fileContents.subarray(1024, 2048))
      .update(fileContents.subarray(4096, 5120))
      .update(fileContents.subarray(16384, 17408))
      .update(fileContents.subarray(65536, 66560))
      .digest("hex");

    expect(result.fullHash).toBe(expectedFullHash);
    expect(result.partialHash).toBe(expectedPartialHash);
    expect(result.koreaderHash).toBe(expectedKoreaderHash);
    expect(result.sizeBytes).toBe(BigInt(fileContents.length));
    expect(result.mtime).toBeInstanceOf(Date);
  });
});

describe("koreaderSampleOffsets", () => {
  it("samples byte 0 and then 1024 << 2i, stopping at the end of the file", () => {
    expect(koreaderSampleOffsets(0)).toEqual([]);
    expect(koreaderSampleOffsets(1)).toEqual([0]);
    expect(koreaderSampleOffsets(1024)).toEqual([0]);
    expect(koreaderSampleOffsets(1025)).toEqual([0, 1024]);
    expect(koreaderSampleOffsets(70_000)).toEqual([0, 1024, 4096, 16384, 65536]);
    expect(koreaderSampleOffsets(2 ** 31)).toHaveLength(12);
    expect(koreaderSampleOffsets(2 ** 31).at(-1)).toBe(2 ** 30);
  });
});

describe("hashKoreaderDocument", () => {
  it("hashes only the sampled 1 KiB windows and tolerates a short final sample", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-koreader-hash-"));
    tempDirectories.push(directory);

    const filePath = path.join(directory, "book.epub");
    // Distinct bytes per position so a wrong window would change the digest;
    // the file ends 100 bytes into the 4 KiB window.
    const fileContents = Buffer.from(Array.from({ length: 4096 + 100 }, (_, index) => index % 251));
    await writeFile(filePath, fileContents);

    const expected = createHash("md5")
      .update(fileContents.subarray(0, KOREADER_SAMPLE_BYTES))
      .update(fileContents.subarray(1024, 2048))
      .update(fileContents.subarray(4096))
      .digest("hex");

    await expect(hashKoreaderDocument(filePath)).resolves.toBe(expected);
  });

  it("returns the MD5 of nothing for an empty file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-koreader-hash-"));
    tempDirectories.push(directory);
    const filePath = path.join(directory, "empty.epub");
    await writeFile(filePath, Buffer.alloc(0));

    await expect(hashKoreaderDocument(filePath)).resolves.toBe(createHash("md5").digest("hex"));
  });
});
