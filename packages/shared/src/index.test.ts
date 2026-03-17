import { describe, expect, it } from "vitest";
import { QUEUES, getQueueConnectionConfig, getQueueUrl } from "./index";

describe("shared queue helpers", () => {
  it("returns the configured queue url", () => {
    process.env.QUEUE_URL = "redis://user:pass@localhost:6379/2";

    expect(getQueueUrl()).toBe("redis://user:pass@localhost:6379/2");
    expect(QUEUES.LIBRARY).toBe("library");
  });

  it("parses redis connection details", () => {
    process.env.QUEUE_URL = "rediss://user:pass@redis.example.com:6380/4";

    expect(getQueueConnectionConfig()).toEqual({
      host: "redis.example.com",
      port: 6380,
      username: "user",
      password: "pass",
      db: 4,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });

  it("throws for missing or unsupported queue configuration", () => {
    delete process.env.QUEUE_URL;
    expect(() => getQueueUrl()).toThrow("QUEUE_URL environment variable is required");

    process.env.QUEUE_URL = "http://localhost:6379";
    expect(() => getQueueConnectionConfig()).toThrow(
      "Unsupported queue protocol: http:",
    );
  });

  it("applies redis defaults when optional parts are absent", () => {
    process.env.QUEUE_URL = "redis://localhost";

    expect(getQueueConnectionConfig()).toEqual({
      host: "localhost",
      port: 6379,
      username: undefined,
      password: undefined,
      db: undefined,
      tls: undefined,
      maxRetriesPerRequest: null,
    });
  });
});
