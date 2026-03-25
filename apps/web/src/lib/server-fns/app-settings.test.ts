import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: (schema: unknown) => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const appSettingFindUniqueMock = vi.fn();
const appSettingFindManyMock = vi.fn();
const appSettingUpsertMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    appSetting: {
      findUnique: (...args: unknown[]): unknown => appSettingFindUniqueMock(...args),
      findMany: (...args: unknown[]): unknown => appSettingFindManyMock(...args),
      upsert: (...args: unknown[]): unknown => appSettingUpsertMock(...args),
    },
  },
}));

import {
  getAllScanConcurrenciesServerFn,
  setScanConcurrencyServerFn,
  getMissingFileBehaviorServerFn,
  setMissingFileBehaviorServerFn,
  getThemeServerFn,
  setThemeServerFn,
  SCAN_CONCURRENCY_DEFAULTS,
} from "./app-settings";

beforeEach(() => {
  appSettingFindUniqueMock.mockReset();
  appSettingFindManyMock.mockReset();
  appSettingUpsertMock.mockReset();
});

describe("getAllScanConcurrenciesServerFn", () => {
  it("returns stored values for all scan types", async () => {
    appSettingFindManyMock.mockResolvedValue([
      { key: "concurrencyFull", value: "10" },
      { key: "concurrencyOnDemand", value: "6" },
      { key: "concurrencyIncremental", value: "2" },
    ]);

    const result = await getAllScanConcurrenciesServerFn({} as never);

    expect(appSettingFindManyMock).toHaveBeenCalledWith({
      where: { key: { in: ["concurrencyFull", "concurrencyOnDemand", "concurrencyIncremental"] } },
    });
    expect(result).toEqual({ full: 10, onDemand: 6, incremental: 2 });
  });

  it("returns defaults when no settings exist", async () => {
    appSettingFindManyMock.mockResolvedValue([]);

    const result = await getAllScanConcurrenciesServerFn({} as never);

    expect(result).toEqual(SCAN_CONCURRENCY_DEFAULTS);
  });

  it("returns partial defaults for missing keys", async () => {
    appSettingFindManyMock.mockResolvedValue([
      { key: "concurrencyFull", value: "12" },
    ]);

    const result = await getAllScanConcurrenciesServerFn({} as never);

    expect(result).toEqual({ full: 12, onDemand: SCAN_CONCURRENCY_DEFAULTS.onDemand, incremental: SCAN_CONCURRENCY_DEFAULTS.incremental });
  });
});

describe("setScanConcurrencyServerFn", () => {
  it("upserts concurrency for full scan type", async () => {
    appSettingUpsertMock.mockResolvedValue({ key: "concurrencyFull", value: "10" });

    const result = await setScanConcurrencyServerFn({ data: { scanType: "full", concurrency: 10 } });

    expect(appSettingUpsertMock).toHaveBeenCalledWith({
      where: { key: "concurrencyFull" },
      create: { key: "concurrencyFull", value: "10" },
      update: { value: "10" },
    });
    expect(result).toEqual({ scanType: "full", concurrency: 10 });
  });

  it("upserts concurrency for onDemand scan type", async () => {
    appSettingUpsertMock.mockResolvedValue({ key: "concurrencyOnDemand", value: "7" });

    const result = await setScanConcurrencyServerFn({ data: { scanType: "onDemand", concurrency: 7 } });

    expect(appSettingUpsertMock).toHaveBeenCalledWith({
      where: { key: "concurrencyOnDemand" },
      create: { key: "concurrencyOnDemand", value: "7" },
      update: { value: "7" },
    });
    expect(result).toEqual({ scanType: "onDemand", concurrency: 7 });
  });

  it("upserts concurrency for incremental scan type", async () => {
    appSettingUpsertMock.mockResolvedValue({ key: "concurrencyIncremental", value: "2" });

    const result = await setScanConcurrencyServerFn({ data: { scanType: "incremental", concurrency: 2 } });

    expect(appSettingUpsertMock).toHaveBeenCalledWith({
      where: { key: "concurrencyIncremental" },
      create: { key: "concurrencyIncremental", value: "2" },
      update: { value: "2" },
    });
    expect(result).toEqual({ scanType: "incremental", concurrency: 2 });
  });
});

describe("getMissingFileBehaviorServerFn", () => {
  it("returns stored behavior value", async () => {
    appSettingFindUniqueMock.mockResolvedValue({ key: "missingFileBehavior", value: "auto-cleanup" });

    const result = await getMissingFileBehaviorServerFn({} as never);

    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({ where: { key: "missingFileBehavior" } });
    expect(result).toBe("auto-cleanup");
  });

  it("returns 'manual' when no setting exists", async () => {
    appSettingFindUniqueMock.mockResolvedValue(null);

    const result = await getMissingFileBehaviorServerFn({} as never);

    expect(result).toBe("manual");
  });
});

describe("setMissingFileBehaviorServerFn", () => {
  it("upserts missing file behavior setting and returns the value", async () => {
    appSettingUpsertMock.mockResolvedValue({ key: "missingFileBehavior", value: "auto-cleanup" });

    const result = await setMissingFileBehaviorServerFn({ data: { behavior: "auto-cleanup" } });

    expect(appSettingUpsertMock).toHaveBeenCalledWith({
      where: { key: "missingFileBehavior" },
      create: { key: "missingFileBehavior", value: "auto-cleanup" },
      update: { value: "auto-cleanup" },
    });
    expect(result).toEqual({ behavior: "auto-cleanup" });
  });
});

describe("getThemeServerFn", () => {
  it("returns stored theme value", async () => {
    appSettingFindUniqueMock.mockResolvedValue({ key: "theme", value: "dark" });

    const result = await getThemeServerFn({} as never);

    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({ where: { key: "theme" } });
    expect(result).toBe("dark");
  });

  it("returns 'system' when no setting exists", async () => {
    appSettingFindUniqueMock.mockResolvedValue(null);

    const result = await getThemeServerFn({} as never);

    expect(result).toBe("system");
  });
});

describe("setThemeServerFn", () => {
  it("upserts theme setting and returns the value", async () => {
    appSettingUpsertMock.mockResolvedValue({ key: "theme", value: "dark" });

    const result = await setThemeServerFn({ data: { theme: "dark" } });

    expect(appSettingUpsertMock).toHaveBeenCalledWith({
      where: { key: "theme" },
      create: { key: "theme", value: "dark" },
      update: { value: "dark" },
    });
    expect(result).toEqual({ theme: "dark" });
  });
});
