import { describe, it, expect } from "vitest";
import { backupManifestSchema, type BackupManifest } from "./manifest";

describe("backupManifestSchema", () => {
  const valid: BackupManifest = {
    version: 1,
    timestamp: "2026-03-28T12:00:00.000Z",
    databaseSize: 1024,
    coverCount: 42,
    coverSize: 2048,
  };

  it("accepts a valid manifest", () => {
    expect(backupManifestSchema.parse(valid)).toEqual(valid);
  });

  it("rejects version other than 1", () => {
    expect(() => backupManifestSchema.parse({ ...valid, version: 2 })).toThrow();
  });

  it("rejects missing timestamp", () => {
    const { timestamp: _, ...rest } = valid;
    expect(() => backupManifestSchema.parse(rest)).toThrow();
  });

  it("rejects non-datetime timestamp", () => {
    expect(() => backupManifestSchema.parse({ ...valid, timestamp: "not-a-date" })).toThrow();
  });

  it("rejects negative databaseSize", () => {
    expect(() => backupManifestSchema.parse({ ...valid, databaseSize: -1 })).toThrow();
  });

  it("rejects negative coverCount", () => {
    expect(() => backupManifestSchema.parse({ ...valid, coverCount: -1 })).toThrow();
  });

  it("rejects non-integer coverCount", () => {
    expect(() => backupManifestSchema.parse({ ...valid, coverCount: 1.5 })).toThrow();
  });

  it("rejects negative coverSize", () => {
    expect(() => backupManifestSchema.parse({ ...valid, coverSize: -1 })).toThrow();
  });

  it("accepts zero values", () => {
    const zero = { ...valid, databaseSize: 0, coverCount: 0, coverSize: 0 };
    expect(backupManifestSchema.parse(zero)).toEqual(zero);
  });

  it("rejects extra fields via strict parsing", () => {
    expect(() => backupManifestSchema.strict().parse({ ...valid, extra: "field" })).toThrow();
  });
});
