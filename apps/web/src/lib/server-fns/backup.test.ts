import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: (schema: object) => Builder;
      handler: <T extends Record<string, string | number | boolean | null | string[] | Date | undefined>>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const appSettingFindUniqueMock = vi.fn();
const appSettingUpsertMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    appSetting: {
      findUnique: appSettingFindUniqueMock,
      upsert: appSettingUpsertMock,
    },
  },
}));

import { getBackupHistoryServerFn, recordBackupServerFn } from "./backup";

beforeEach(() => {
  appSettingFindUniqueMock.mockReset();
  appSettingUpsertMock.mockReset();
});

describe("getBackupHistoryServerFn", () => {
  it("returns empty array when no history exists", async () => {
    appSettingFindUniqueMock.mockResolvedValue(null);

    const result = await getBackupHistoryServerFn();

    expect(result).toEqual([]);
    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({
      where: { key: "backupHistory" },
    });
  });

  it("returns parsed history array", async () => {
    const history = [
      { version: 1, timestamp: "2026-03-28T12:00:00.000Z", databaseSize: 100, coverCount: 5, coverSize: 500 },
    ];
    appSettingFindUniqueMock.mockResolvedValue({ key: "backupHistory", value: JSON.stringify(history) });

    const result = await getBackupHistoryServerFn();

    expect(result).toEqual(history);
  });

  it("returns empty array for invalid JSON", async () => {
    appSettingFindUniqueMock.mockResolvedValue({ key: "backupHistory", value: "not-json" });

    const result = await getBackupHistoryServerFn();

    expect(result).toEqual([]);
  });
});

describe("recordBackupServerFn", () => {
  it("creates new history when none exists", async () => {
    appSettingFindUniqueMock.mockResolvedValue(null);

    const entry = {
      version: 1 as const,
      timestamp: "2026-03-28T12:00:00.000Z",
      databaseSize: 100,
      coverCount: 5,
      coverSize: 500,
    };

    await recordBackupServerFn({ data: entry } as never);

    expect(appSettingUpsertMock).toHaveBeenCalledWith({
      where: { key: "backupHistory" },
      create: { key: "backupHistory", value: JSON.stringify([entry]) },
      update: { value: JSON.stringify([entry]) },
    });
  });

  it("prepends to existing history", async () => {
    const existing = [
      { version: 1, timestamp: "2026-03-27T12:00:00.000Z", databaseSize: 50, coverCount: 3, coverSize: 300 },
    ];
    appSettingFindUniqueMock.mockResolvedValue({ key: "backupHistory", value: JSON.stringify(existing) });

    const entry = {
      version: 1 as const,
      timestamp: "2026-03-28T12:00:00.000Z",
      databaseSize: 100,
      coverCount: 5,
      coverSize: 500,
    };

    await recordBackupServerFn({ data: entry } as never);

    const firstCall = appSettingUpsertMock.mock.calls[0] as [{ update: { value: string } }];
    const savedValue = firstCall[0].update.value;
    const parsed = JSON.parse(savedValue) as Record<string, number | string>[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual(entry);
    expect(parsed[1]).toEqual(existing[0]);
  });

  it("caps history at 20 entries", async () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({
      version: 1,
      timestamp: `2026-03-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
      databaseSize: 100,
      coverCount: 5,
      coverSize: 500,
    }));
    appSettingFindUniqueMock.mockResolvedValue({ key: "backupHistory", value: JSON.stringify(existing) });

    const entry = {
      version: 1 as const,
      timestamp: "2026-03-28T12:00:00.000Z",
      databaseSize: 200,
      coverCount: 10,
      coverSize: 1000,
    };

    await recordBackupServerFn({ data: entry } as never);

    const firstCall2 = appSettingUpsertMock.mock.calls[0] as [{ update: { value: string } }];
    const savedValue = firstCall2[0].update.value;
    const parsed = JSON.parse(savedValue) as Record<string, number | string>[];
    expect(parsed).toHaveLength(20);
    expect(parsed[0]).toEqual(entry);
  });
});
