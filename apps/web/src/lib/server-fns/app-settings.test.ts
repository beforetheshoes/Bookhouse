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
const appSettingUpsertMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    appSetting: {
      findUnique: (...args: unknown[]): unknown => appSettingFindUniqueMock(...args),
      upsert: (...args: unknown[]): unknown => appSettingUpsertMock(...args),
    },
  },
}));

import {
  getWorkerConcurrencyServerFn,
  setWorkerConcurrencyServerFn,
  getMissingFileBehaviorServerFn,
  setMissingFileBehaviorServerFn,
} from "./app-settings";

beforeEach(() => {
  appSettingFindUniqueMock.mockReset();
  appSettingUpsertMock.mockReset();
});

describe("getWorkerConcurrencyServerFn", () => {
  it("returns stored concurrency value", async () => {
    appSettingFindUniqueMock.mockResolvedValue({ key: "workerConcurrency", value: "8" });

    const result = await getWorkerConcurrencyServerFn({} as never);

    expect(appSettingFindUniqueMock).toHaveBeenCalledWith({ where: { key: "workerConcurrency" } });
    expect(result).toBe(8);
  });

  it("returns default 5 when no setting exists", async () => {
    appSettingFindUniqueMock.mockResolvedValue(null);

    const result = await getWorkerConcurrencyServerFn({} as never);

    expect(result).toBe(5);
  });
});

describe("setWorkerConcurrencyServerFn", () => {
  it("upserts concurrency setting and returns the value", async () => {
    appSettingUpsertMock.mockResolvedValue({ key: "workerConcurrency", value: "10" });

    const result = await setWorkerConcurrencyServerFn({ data: { concurrency: 10 } });

    expect(appSettingUpsertMock).toHaveBeenCalledWith({
      where: { key: "workerConcurrency" },
      create: { key: "workerConcurrency", value: "10" },
      update: { value: "10" },
    });
    expect(result).toEqual({ concurrency: 10 });
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
