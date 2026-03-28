export class TokenBucketLimiter {
  private readonly intervalMs: number;
  private nextAllowedTime = 0;

  constructor(tokensPerSecond: number) {
    this.intervalMs = Math.ceil(1000 / tokensPerSecond);
  }

  async acquire(): Promise<void> {
    const now = Date.now();

    if (now >= this.nextAllowedTime) {
      this.nextAllowedTime = now + this.intervalMs;
      return;
    }

    const waitMs = this.nextAllowedTime - now;
    this.nextAllowedTime += this.intervalMs;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
}
