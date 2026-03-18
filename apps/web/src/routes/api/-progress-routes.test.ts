import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressKind, ProgressTrackingMode } from "@bookhouse/domain";

const deleteReadingProgressMock = vi.fn();
const getReadingProgressMock = vi.fn();
const getUserProgressTrackingModeMock = vi.fn();
const getWorkProgressViewMock = vi.fn();
const upsertReadingProgressMock = vi.fn();
const updateUserProgressTrackingModeMock = vi.fn();
const updateWorkProgressTrackingModeMock = vi.fn();

vi.mock("../../lib/library-service", () => ({
  deleteReadingProgress: deleteReadingProgressMock,
  getReadingProgress: getReadingProgressMock,
  getUserProgressTrackingMode: getUserProgressTrackingModeMock,
  getWorkProgressView: getWorkProgressViewMock,
  upsertReadingProgress: upsertReadingProgressMock,
  updateUserProgressTrackingMode: updateUserProgressTrackingModeMock,
  updateWorkProgressTrackingMode: updateWorkProgressTrackingModeMock,
}));

beforeEach(() => {
  deleteReadingProgressMock.mockReset();
  getReadingProgressMock.mockReset();
  getUserProgressTrackingModeMock.mockReset();
  getWorkProgressViewMock.mockReset();
  upsertReadingProgressMock.mockReset();
  updateUserProgressTrackingModeMock.mockReset();
  updateWorkProgressTrackingModeMock.mockReset();
});

describe("progress API routes", () => {
  it("serves authenticated reading progress CRUD", async () => {
    const progressModule = await import("./progress");
    const handlers = progressModule.progressHandlers;

    getReadingProgressMock.mockResolvedValueOnce({ id: "progress-1", percent: 0.4 });
    upsertReadingProgressMock.mockResolvedValueOnce({ id: "progress-1", percent: 0.6 });

    const getResponse = await handlers.GET({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress?editionId=edition-1&progressKind=EBOOK&source=kobo"),
    } as never);
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({ id: "progress-1", percent: 0.4 });

    const putResponse = await handlers.PUT({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress", {
        body: JSON.stringify({
          editionId: "edition-1",
          locator: { cfi: {} },
          percent: 0.6,
          progressKind: ProgressKind.EBOOK,
          source: "kobo",
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    } as never);
    expect(putResponse.status).toBe(200);
    await expect(putResponse.json()).resolves.toEqual({ id: "progress-1", percent: 0.6 });

    const deleteResponse = await handlers.DELETE({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress", {
        body: JSON.stringify({
          editionId: "edition-1",
          progressKind: ProgressKind.EBOOK,
          source: "kobo",
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
    } as never);
    expect(deleteResponse.status).toBe(204);
  });

  it("returns auth, validation, and not-found errors for reading progress routes", async () => {
    const progressModule = await import("./progress");
    const handlers = progressModule.progressHandlers;

    const unauthorized = await handlers.GET({
      context: {},
      request: new Request("http://localhost/api/progress?editionId=edition-1&progressKind=EBOOK"),
    } as never);
    expect(unauthorized.status).toBe(401);

    const invalid = await handlers.PUT({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress", {
        body: JSON.stringify({
          editionId: "edition-1",
          locator: { cfi: "bad" },
          percent: 2,
          progressKind: ProgressKind.EBOOK,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    } as never);
    expect(invalid.status).toBe(400);

    const invalidGet = await handlers.GET({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress?editionId=&progressKind=EBOOK"),
    } as never);
    expect(invalidGet.status).toBe(400);

    getReadingProgressMock.mockResolvedValueOnce(null);
    const missing = await handlers.GET({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress?editionId=edition-1&progressKind=EBOOK"),
    } as never);
    expect(missing.status).toBe(404);

    const unauthorizedPut = await handlers.PUT({
      context: {},
      request: new Request("http://localhost/api/progress", {
        body: JSON.stringify({
          editionId: "edition-1",
          locator: { cfi: {} },
          percent: 0.2,
          progressKind: ProgressKind.EBOOK,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    } as never);
    expect(unauthorizedPut.status).toBe(401);

    const unauthorizedDelete = await handlers.DELETE({
      context: {},
      request: new Request("http://localhost/api/progress", {
        body: JSON.stringify({
          editionId: "edition-1",
          progressKind: ProgressKind.EBOOK,
          source: null,
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
    } as never);
    expect(unauthorizedDelete.status).toBe(401);

    const invalidDelete = await handlers.DELETE({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress", {
        body: JSON.stringify({
          editionId: "",
          progressKind: ProgressKind.EBOOK,
          source: null,
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
    } as never);
    expect(invalidDelete.status).toBe(400);

    const fallbackError = await handlers.PUT({
      context: { auth: { user: { id: "user-1" } } },
      request: {
        json: async () => Promise.reject("bad-payload"),
      } as unknown as Request,
    } as never);
    expect(fallbackError.status).toBe(400);
    await expect(fallbackError.json()).resolves.toEqual({ error: "Invalid request" });
  });

  it("serves mode and work endpoints", async () => {
    const modeModule = await import("./progress/mode");
    const workModule = await import("./progress/works/$workId");
    const workModeModule = await import("./progress/works/$workId/mode");

    getUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_WORK);
    updateUserProgressTrackingModeMock.mockResolvedValueOnce(ProgressTrackingMode.BY_EDITION);
    getWorkProgressViewMock.mockResolvedValueOnce({ workId: "work-1", workTitle: "Book" });
    updateWorkProgressTrackingModeMock.mockResolvedValueOnce(null);

    const getModeResponse = await modeModule.progressModeHandlers.GET({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress/mode"),
    } as never);
    expect(getModeResponse.status).toBe(200);
    await expect(getModeResponse.json()).resolves.toEqual({
      progressTrackingMode: ProgressTrackingMode.BY_WORK,
    });

    const putModeResponse = await modeModule.progressModeHandlers.PUT({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress/mode", {
        body: JSON.stringify({ progressTrackingMode: ProgressTrackingMode.BY_EDITION }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    } as never);
    expect(putModeResponse.status).toBe(200);
    await expect(putModeResponse.json()).resolves.toEqual({
      progressTrackingMode: ProgressTrackingMode.BY_EDITION,
    });

    const getWorkResponse = await workModule.workProgressHandlers.GET({
      context: { auth: { user: { id: "user-1" } } },
      params: { workId: "work-1" },
      request: new Request("http://localhost/api/progress/works/work-1"),
    } as never);
    expect(getWorkResponse.status).toBe(200);
    await expect(getWorkResponse.json()).resolves.toEqual({ workId: "work-1", workTitle: "Book" });

    const putWorkModeResponse = await workModeModule.workProgressModeHandlers.PUT({
      context: { auth: { user: { id: "user-1" } } },
      params: { workId: "work-1" },
      request: new Request("http://localhost/api/progress/works/work-1/mode", {
        body: JSON.stringify({ progressTrackingMode: null }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    } as never);
    expect(putWorkModeResponse.status).toBe(200);
    await expect(putWorkModeResponse.json()).resolves.toEqual({
      progressTrackingMode: null,
    });
  });

  it("returns 401, 400, and 404 for mode and work route errors", async () => {
    const modeModule = await import("./progress/mode");
    const workModule = await import("./progress/works/$workId");
    const workModeModule = await import("./progress/works/$workId/mode");

    const unauthorized = await modeModule.progressModeHandlers.GET({
      context: {},
      request: new Request("http://localhost/api/progress/mode"),
    } as never);
    expect(unauthorized.status).toBe(401);

    const unauthorizedWork = await workModule.workProgressHandlers.GET({
      context: {},
      params: { workId: "work-1" },
      request: new Request("http://localhost/api/progress/works/work-1"),
    } as never);
    expect(unauthorizedWork.status).toBe(401);

    const invalid = await workModeModule.workProgressModeHandlers.PUT({
      context: { auth: { user: { id: "user-1" } } },
      params: { workId: "work-1" },
      request: new Request("http://localhost/api/progress/works/work-1/mode", {
        body: JSON.stringify({ progressTrackingMode: "BAD_MODE" }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    } as never);
    expect(invalid.status).toBe(400);

    const unauthorizedModePut = await modeModule.progressModeHandlers.PUT({
      context: {},
      request: new Request("http://localhost/api/progress/mode", {
        body: JSON.stringify({ progressTrackingMode: ProgressTrackingMode.BY_WORK }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    } as never);
    expect(unauthorizedModePut.status).toBe(401);

    const invalidModePut = await modeModule.progressModeHandlers.PUT({
      context: { auth: { user: { id: "user-1" } } },
      request: new Request("http://localhost/api/progress/mode", {
        body: JSON.stringify({ progressTrackingMode: "BAD_MODE" }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    } as never);
    expect(invalidModePut.status).toBe(400);

    const fallbackModePut = await modeModule.progressModeHandlers.PUT({
      context: { auth: { user: { id: "user-1" } } },
      request: {
        json: async () => Promise.reject("bad-payload"),
      } as unknown as Request,
    } as never);
    expect(fallbackModePut.status).toBe(400);
    await expect(fallbackModePut.json()).resolves.toEqual({ error: "Invalid request" });

    const unauthorizedWorkModePut = await workModeModule.workProgressModeHandlers.PUT({
      context: {},
      params: { workId: "work-1" },
      request: new Request("http://localhost/api/progress/works/work-1/mode", {
        body: JSON.stringify({ progressTrackingMode: null }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    } as never);
    expect(unauthorizedWorkModePut.status).toBe(401);

    const fallbackWorkModePut = await workModeModule.workProgressModeHandlers.PUT({
      context: { auth: { user: { id: "user-1" } } },
      params: { workId: "work-1" },
      request: {
        json: async () => Promise.reject("bad-payload"),
      } as unknown as Request,
    } as never);
    expect(fallbackWorkModePut.status).toBe(400);
    await expect(fallbackWorkModePut.json()).resolves.toEqual({ error: "Invalid request" });

    getWorkProgressViewMock.mockResolvedValueOnce(null);
    const missing = await workModule.workProgressHandlers.GET({
      context: { auth: { user: { id: "user-1" } } },
      params: { workId: "missing-work" },
      request: new Request("http://localhost/api/progress/works/missing-work"),
    } as never);
    expect(missing.status).toBe(404);
  });
});
