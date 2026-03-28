import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenBucketLimiter } from "./token-bucket";

describe("TokenBucketLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first call proceeds immediately without delay", async () => {
    const limiter = new TokenBucketLimiter(3);
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBe(0);
  });

  it("spaces calls according to tokens per second", async () => {
    const limiter = new TokenBucketLimiter(2); // 1 call per 500ms
    await limiter.acquire(); // immediate

    const promise = limiter.acquire(); // should wait ~500ms
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    // Should have waited 500ms
    expect(Date.now()).toBeGreaterThanOrEqual(500);
  });

  it("handles 1 token per second rate", async () => {
    const limiter = new TokenBucketLimiter(1); // 1 call per 1000ms
    await limiter.acquire();

    const promise = limiter.acquire();
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(Date.now()).toBeGreaterThanOrEqual(1000);
  });

  it("does not delay when enough time has passed naturally", async () => {
    const limiter = new TokenBucketLimiter(2); // 500ms interval
    await limiter.acquire();

    vi.advanceTimersByTime(600); // advance past the interval
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBe(0);
  });
});
