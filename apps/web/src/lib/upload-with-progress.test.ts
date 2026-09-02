import { describe, expect, it, vi } from "vitest";
import { uploadWithProgress } from "./upload-with-progress";

class FakeXhr {
  status = 0;
  responseText = "";
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => { this.onabort?.(); });
}

describe("uploadWithProgress", () => {
  it("posts the body, reports progress and resolves with the response", async () => {
    const xhr = new FakeXhr();
    const onProgress = vi.fn();
    const body = new FormData();
    const promise = uploadWithProgress("/api/upload-book", body, { onProgress, createRequest: () => xhr as never });

    expect(xhr.open).toHaveBeenCalledWith("POST", "/api/upload-book");
    expect(xhr.send).toHaveBeenCalledWith(body);
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
    xhr.status = 200;
    xhr.responseText = '{"importJobId":"ij-1"}';
    xhr.onload?.();

    await expect(promise).resolves.toEqual({ ok: true, status: 200, text: '{"importJobId":"ij-1"}' });
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ loaded: 50, total: 100 });
  });

  it("resolves ok:false for an error status and rejects on network failure", async () => {
    const xhr = new FakeXhr();
    const promise = uploadWithProgress("/u", new FormData(), { createRequest: () => xhr as never });
    xhr.status = 413;
    xhr.responseText = "too large";
    xhr.onload?.();
    await expect(promise).resolves.toEqual({ ok: false, status: 413, text: "too large" });

    const failing = new FakeXhr();
    const failure = uploadWithProgress("/u", new FormData(), { createRequest: () => failing as never });
    failing.onerror?.();
    await expect(failure).rejects.toThrow("Network error during upload");
  });

  it("aborts when the signal fires, before or after sending", async () => {
    const controller = new AbortController();
    const xhr = new FakeXhr();
    const promise = uploadWithProgress("/u", new FormData(), { signal: controller.signal, createRequest: () => xhr as never });
    controller.abort();
    await expect(promise).rejects.toThrow("Upload cancelled");
    expect(xhr.abort).toHaveBeenCalledTimes(1);

    const early = new AbortController();
    early.abort();
    const earlyXhr = new FakeXhr();
    await expect(uploadWithProgress("/u", new FormData(), { signal: early.signal, createRequest: () => earlyXhr as never }))
      .rejects.toThrow("Upload cancelled");
    expect(earlyXhr.send).not.toHaveBeenCalled();
  });

  it("uses the browser's XMLHttpRequest when no factory is injected", async () => {
    const created: FakeXhr[] = [];
    const original = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = class extends FakeXhr {
      constructor() { super(); created.push(this); }
    } as never;
    try {
      const promise = uploadWithProgress("/u", new FormData());
      const xhr = created[0] as FakeXhr;
      xhr.status = 204;
      xhr.onload?.();
      await expect(promise).resolves.toEqual({ ok: true, status: 204, text: "" });
    } finally {
      globalThis.XMLHttpRequest = original;
    }
  });
});
