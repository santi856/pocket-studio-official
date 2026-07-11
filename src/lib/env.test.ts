// @vitest-environment node
import { describe, expect, it, beforeEach, vi } from "vitest";

describe("getServerEnv", () => {
  const REAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...REAL_ENV };
  });

  it("parses a valid environment and defaults AI_PROVIDER to mock", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.SESSION_SECRET = "a".repeat(32);
    delete process.env.AI_PROVIDER;

    const { getServerEnv } = await import("./env");
    const env = getServerEnv();

    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
  });

  it("throws a readable error when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    process.env.SESSION_SECRET = "a".repeat(32);

    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).toThrow(/DATABASE_URL/);
  });

  it("throws when SESSION_SECRET is too short", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.SESSION_SECRET = "too-short";

    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).toThrow(/SESSION_SECRET/);
  });

  it("requires ANTHROPIC_API_KEY when AI_PROVIDER=anthropic", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.SESSION_SECRET = "a".repeat(32);
    process.env.AI_PROVIDER = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;

    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).toThrow(/ANTHROPIC_API_KEY/);
  });
});
