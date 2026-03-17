import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PARTIAL_HASH_BYTES, hashFileContents } from "./index";

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

    expect(result.fullHash).toBe(expectedFullHash);
    expect(result.partialHash).toBe(expectedPartialHash);
    expect(result.sizeBytes).toBe(BigInt(fileContents.length));
    expect(result.mtime).toBeInstanceOf(Date);
  });
});
