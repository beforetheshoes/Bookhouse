import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const limiter = new RateLimiter(5, 60_000);
    expect(limiter.check()).toEqual({ allowed: true });
  });

  it("blocks requests over the limit", () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.check(); // 1
    limiter.check(); // 2
    const result = limiter.check(); // 3 — should be blocked
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("slides window — old requests expire", () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.check(); // t=0
    limiter.check(); // t=0

    // Advance past the window
    vi.advanceTimersByTime(60_001);

    // Should be allowed again
    expect(limiter.check()).toEqual({ allowed: true });
  });

  it("returns correct retryAfterMs", () => {
    const limiter = new RateLimiter(1, 10_000);
    limiter.check(); // t=0

    vi.advanceTimersByTime(3_000); // t=3000

    const result = limiter.check();
    expect(result.allowed).toBe(false);
    // The first request was at t=0, window is 10_000ms, so it expires at t=10_000
    // Current time is t=3_000, so retryAfterMs should be ~7_000
    expect(result.retryAfterMs).toBe(7_000);
  });

  it("tracks requests independently within the window", () => {
    const limiter = new RateLimiter(2, 10_000);
    limiter.check(); // t=0

    vi.advanceTimersByTime(5_000);
    limiter.check(); // t=5000 — at limit

    vi.advanceTimersByTime(5_001);
    // t=10_001 — first request (t=0) expired, one remains (t=5000)
    // So this should succeed (1 in window + this = 2 = limit)
    expect(limiter.check().allowed).toBe(true);

    // Now at limit again (t=5000 and t=10_001)
    expect(limiter.check().allowed).toBe(false);
  });

  it("uses default config (100 requests per 5 minutes)", () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 100; i++) {
      expect(limiter.check().allowed).toBe(true);
    }
    expect(limiter.check().allowed).toBe(false);
  });
});
