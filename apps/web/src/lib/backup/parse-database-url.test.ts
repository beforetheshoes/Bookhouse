import { describe, it, expect } from "vitest";
import { parseDatabaseUrl } from "./parse-database-url";

describe("parseDatabaseUrl", () => {
  it("parses a standard postgres URL", () => {
    const result = parseDatabaseUrl("postgresql://user:pass@localhost:5432/mydb");
    expect(result).toEqual({
      host: "localhost",
      port: 5432,
      user: "user",
      password: "pass",
      database: "mydb",
    });
  });

  it("handles URL-encoded special characters in password", () => {
    const result = parseDatabaseUrl("postgresql://user:p%40ss%23word@host:5432/db");
    expect(result).toEqual({
      host: "host",
      port: 5432,
      user: "user",
      password: "p@ss#word",
      database: "db",
    });
  });

  it("defaults port to 5432 when omitted", () => {
    const result = parseDatabaseUrl("postgresql://user:pass@host/db");
    expect(result).toEqual({
      host: "host",
      port: 5432,
      user: "user",
      password: "pass",
      database: "db",
    });
  });

  it("handles postgres:// protocol alias", () => {
    const result = parseDatabaseUrl("postgres://user:pass@host:5433/db");
    expect(result).toEqual({
      host: "host",
      port: 5433,
      user: "user",
      password: "pass",
      database: "db",
    });
  });

  it("throws on missing host", () => {
    expect(() => parseDatabaseUrl("postgresql://user:pass@/db")).toThrow();
  });

  it("throws on missing database", () => {
    expect(() => parseDatabaseUrl("postgresql://user:pass@host:5432")).toThrow("database");
  });

  it("throws on missing user", () => {
    expect(() => parseDatabaseUrl("postgresql://:pass@host:5432/db")).toThrow("user");
  });

  it("throws on invalid URL", () => {
    expect(() => parseDatabaseUrl("not-a-url")).toThrow();
  });
});
