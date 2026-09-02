import { isIP } from "node:net";

export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_REMOTE_IMAGE_REDIRECTS = 3;
export const REMOTE_IMAGE_TIMEOUT_MS = 15_000;

export interface FetchImageDeps {
  fetch: (url: string, init: { redirect: "manual"; signal: AbortSignal }) => Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    body: ReadableStream<Uint8Array> | null;
  }>;
  /** Resolve every address a hostname points at (dns.promises.lookup with { all: true }). */
  lookup: (hostname: string) => Promise<{ address: string }[]>;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface FetchedImage {
  buffer: Buffer;
  contentType: string | null;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * True for loopback, unspecified, private, link-local and CGNAT addresses —
 * anything a fetch from inside the container must not be pointed at (the
 * database, the queue, cloud metadata endpoints, the LAN).
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;
  const lower = address.toLowerCase();
  const mapped = /^(?:0*:)*ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateIpv4(mapped[1] as string);
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") || lower.startsWith("fd") || // unique local fc00::/7
    lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb") // link-local fe80::/10
  );
}

async function assertPublicHost(url: URL, deps: FetchImageDeps): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme: ${url.protocol}`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Refusing to fetch from a private address");
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await deps.lookup(hostname);
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Refusing to fetch from a private address");
  }
}

async function readCapped(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Image too large (max 10 MB)");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch a user- or provider-supplied image URL for a cover or author photo.
 * Only http(s) to public addresses is allowed (each redirect hop is checked
 * again), the body is capped while streaming rather than after buffering, and
 * the whole thing gives up after a timeout — so a bad URL cannot probe the
 * container's network or exhaust its memory.
 */
export async function fetchRemoteImage(imageUrl: string, deps: FetchImageDeps): Promise<FetchedImage> {
  const maxBytes = deps.maxBytes ?? MAX_REMOTE_IMAGE_BYTES;
  const signal = AbortSignal.timeout(deps.timeoutMs ?? REMOTE_IMAGE_TIMEOUT_MS);
  let url = new URL(imageUrl);

  for (let hop = 0; ; hop += 1) {
    await assertPublicHost(url, deps);
    const response = await deps.fetch(url.toString(), { redirect: "manual", signal });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop >= MAX_REMOTE_IMAGE_REDIRECTS) {
        throw new Error("Too many redirects fetching image");
      }
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${String(response.status)}`);
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error("Image too large (max 10 MB)");
    }

    const buffer = response.body === null ? Buffer.alloc(0) : await readCapped(response.body, maxBytes);
    return { buffer, contentType: response.headers.get("content-type") };
  }
}
