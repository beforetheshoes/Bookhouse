export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly timestamps: number[] = [];

  constructor(maxRequests = 100, windowMs = 300_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove expired timestamps
    while (this.timestamps.length > 0) {
      const first = this.timestamps[0] as number;
      if (first > windowStart) break;
      this.timestamps.shift();
    }

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0] as number;
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      return { allowed: false, retryAfterMs };
    }

    this.timestamps.push(now);
    return { allowed: true };
  }
}
