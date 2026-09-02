import { describe, expect, it, vi } from "vitest";
import { fetchRemoteImage, isPrivateAddress, type FetchImageDeps } from "./fetch-image";

function response(init: {
  status?: number;
  body?: Buffer | Uint8Array[] | null;
  headers?: Record<string, string>;
}) {
  const headers = new Map(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const chunks = init.body === undefined
    ? [Buffer.from("image-bytes")]
    : init.body === null
      ? null
      : Array.isArray(init.body) ? init.body : [init.body];
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    body: chunks === null
      ? null
      : new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
  };
}

function makeDeps(overrides: Partial<FetchImageDeps> = {}): FetchImageDeps {
  return {
    fetch: vi.fn().mockResolvedValue(response({ headers: { "content-type": "image/jpeg" } })),
    lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]),
    ...overrides,
  };
}

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local, CGNAT and unspecified ranges", () => {
    for (const address of [
      "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
      "100.64.0.1", "0.0.0.0", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("accepts public addresses and rejects non-addresses", () => {
    for (const address of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});

describe("fetchRemoteImage", () => {
  it("fetches a public https URL with manual redirects and a timeout, returning the body and type", async () => {
    const deps = makeDeps();
    const result = await fetchRemoteImage("https://example.com/cover.jpg", deps);

    expect(result.buffer).toEqual(Buffer.from("image-bytes"));
    expect(result.contentType).toBe("image/jpeg");
    expect(deps.lookup).toHaveBeenCalledWith("example.com");
    expect(deps.fetch).toHaveBeenCalledWith(
      "https://example.com/cover.jpg",
      expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });

  it("rejects non-http schemes without touching the network", async () => {
    const deps = makeDeps();
    await expect(fetchRemoteImage("file:///etc/passwd", deps)).rejects.toThrow("Unsupported URL scheme");
    await expect(fetchRemoteImage("ftp://example.com/x", deps)).rejects.toThrow("Unsupported URL scheme");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("refuses hosts that resolve to a private address, localhost, or IP literals in private ranges", async () => {
    const deps = makeDeps({ lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34" }, { address: "10.0.0.5" }]) });
    await expect(fetchRemoteImage("https://dual.example.com/x.jpg", deps)).rejects.toThrow("private address");
    await expect(fetchRemoteImage("http://localhost:6379/x", deps)).rejects.toThrow("private address");
    await expect(fetchRemoteImage("http://db.localhost/x", deps)).rejects.toThrow("private address");
    await expect(fetchRemoteImage("http://169.254.169.254/latest/meta-data", deps)).rejects.toThrow("private address");
    await expect(fetchRemoteImage("http://[::1]/x", deps)).rejects.toThrow("private address");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("refuses a hostname that resolves to nothing", async () => {
    const deps = makeDeps({ lookup: vi.fn().mockResolvedValue([]) });
    await expect(fetchRemoteImage("https://nowhere.example/x.jpg", deps)).rejects.toThrow("private address");
  });

  it("follows redirects but re-validates every hop", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ status: 302, headers: { location: "/moved.jpg" } }))
      .mockResolvedValueOnce(response({ status: 301, headers: { location: "http://10.0.0.9/internal.jpg" } }));
    const deps = makeDeps({ fetch });

    await expect(fetchRemoteImage("https://example.com/cover.jpg", deps)).rejects.toThrow("private address");
    expect(fetch).toHaveBeenNthCalledWith(2, "https://example.com/moved.jpg", expect.anything());
  });

  it("returns the final body after an allowed redirect", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ status: 307, headers: { location: "https://cdn.example.com/c.jpg" } }))
      .mockResolvedValueOnce(response({ body: Buffer.from("final"), headers: { "content-type": "image/png" } }));
    const result = await fetchRemoteImage("https://example.com/cover.jpg", makeDeps({ fetch }));
    expect(result).toEqual({ buffer: Buffer.from("final"), contentType: "image/png" });
  });

  it("gives up after too many redirects or a redirect without a location", async () => {
    const loop = vi.fn().mockResolvedValue(response({ status: 302, headers: { location: "https://example.com/again" } }));
    await expect(fetchRemoteImage("https://example.com/a", makeDeps({ fetch: loop }))).rejects.toThrow("Too many redirects");
    expect(loop).toHaveBeenCalledTimes(4);

    const noLocation = vi.fn().mockResolvedValue(response({ status: 302 }));
    await expect(fetchRemoteImage("https://example.com/a", makeDeps({ fetch: noLocation }))).rejects.toThrow("Too many redirects");
  });

  it("fails on non-2xx responses", async () => {
    const deps = makeDeps({ fetch: vi.fn().mockResolvedValue(response({ status: 404, body: null })) });
    await expect(fetchRemoteImage("https://example.com/missing.jpg", deps)).rejects.toThrow("Failed to fetch image: 404");
  });

  it("rejects a declared Content-Length over the cap before reading the body", async () => {
    const deps = makeDeps({
      fetch: vi.fn().mockResolvedValue(response({ headers: { "content-length": String(11 * 1024 * 1024) } })),
    });
    await expect(fetchRemoteImage("https://example.com/big.jpg", deps)).rejects.toThrow("Image too large");
  });

  it("stops reading once the streamed body exceeds the cap", async () => {
    const deps = makeDeps({
      maxBytes: 8,
      fetch: vi.fn().mockResolvedValue(response({ body: [new Uint8Array(5), new Uint8Array(5), new Uint8Array(5)] })),
    });
    await expect(fetchRemoteImage("https://example.com/big.jpg", deps)).rejects.toThrow("Image too large");
  });

  it("treats a missing body as empty", async () => {
    const deps = makeDeps({ fetch: vi.fn().mockResolvedValue(response({ body: null })) });
    await expect(fetchRemoteImage("https://example.com/empty.jpg", deps)).resolves.toEqual({
      buffer: Buffer.alloc(0),
      contentType: null,
    });
  });
});
