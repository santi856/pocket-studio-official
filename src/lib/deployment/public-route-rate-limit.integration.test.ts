// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

const BASE_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
};

async function loadModule(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  setEnv({ ...BASE_ENV, ...overrides });
  return import("./public-route-rate-limit");
}

describe("public route rate limiting", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("allows requests under the configured threshold", async () => {
    const { isPublicRouteRateLimited } = await loadModule({
      PUBLIC_ROUTE_RATE_LIMIT_MAX_ATTEMPTS: "3",
    });

    expect(await isPublicRouteRateLimited("my-app", "1.1.1.1")).toBe(false);
    expect(await isPublicRouteRateLimited("my-app", "1.1.1.1")).toBe(false);
  });

  it("rate-limits once the threshold is reached within the window", async () => {
    const { isPublicRouteRateLimited } = await loadModule({
      PUBLIC_ROUTE_RATE_LIMIT_MAX_ATTEMPTS: "3",
    });

    await isPublicRouteRateLimited("my-app", "1.1.1.1");
    await isPublicRouteRateLimited("my-app", "1.1.1.1");
    await isPublicRouteRateLimited("my-app", "1.1.1.1");

    expect(await isPublicRouteRateLimited("my-app", "1.1.1.1")).toBe(true);
  });

  it("scopes the limit per (publicSlug, ipAddress) — a different app or a different IP is unaffected", async () => {
    const { isPublicRouteRateLimited } = await loadModule({
      PUBLIC_ROUTE_RATE_LIMIT_MAX_ATTEMPTS: "1",
    });

    await isPublicRouteRateLimited("app-a", "1.1.1.1");
    expect(await isPublicRouteRateLimited("app-a", "1.1.1.1")).toBe(true);

    // Different app, same IP — unaffected.
    expect(await isPublicRouteRateLimited("app-b", "1.1.1.1")).toBe(false);
    // Same app, different IP — unaffected.
    expect(await isPublicRouteRateLimited("app-a", "2.2.2.2")).toBe(false);
  });

  it("ignores requests outside the configured window", async () => {
    await db.publicRouteRequest.createMany({
      data: Array.from({ length: 5 }, () => ({
        publicSlug: "my-app",
        ipAddress: "1.1.1.1",
        createdAt: new Date(Date.now() - 120 * 1000),
      })),
    });
    const { isPublicRouteRateLimited } = await loadModule({
      PUBLIC_ROUTE_RATE_LIMIT_MAX_ATTEMPTS: "3",
      PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS: "60",
    });

    expect(await isPublicRouteRateLimited("my-app", "1.1.1.1")).toBe(false);
  });
});
