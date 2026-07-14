// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import {
  assertNotLoginRateLimited,
  clearLoginAttempts,
  deleteOldLoginAttempts,
  recordFailedLoginAttempt,
  TooManyLoginAttemptsError,
} from "./login-rate-limit";

describe("login rate limiting", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("does not rate-limit before the threshold is reached", async () => {
    for (let i = 0; i < 4; i++) {
      await recordFailedLoginAttempt("threshold@example.com");
    }

    await expect(assertNotLoginRateLimited("threshold@example.com")).resolves.toBeUndefined();
  });

  it("rate-limits once the threshold is reached", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedLoginAttempt("over-threshold@example.com");
    }

    await expect(assertNotLoginRateLimited("over-threshold@example.com")).rejects.toBeInstanceOf(
      TooManyLoginAttemptsError,
    );
  });

  it("normalizes email case/whitespace so a lockout cannot be bypassed by resubmitting a differently-cased address", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedLoginAttempt("  Case@Example.com  ");
    }

    await expect(assertNotLoginRateLimited("case@example.com")).rejects.toBeInstanceOf(
      TooManyLoginAttemptsError,
    );
  });

  it("ignores attempts outside the 15-minute window", async () => {
    const email = "stale@example.com";
    await db.loginAttempt.createMany({
      data: Array.from({ length: 5 }, () => ({
        email,
        createdAt: new Date(Date.now() - 16 * 60 * 1000),
      })),
    });

    await expect(assertNotLoginRateLimited(email)).resolves.toBeUndefined();
  });

  it("clearLoginAttempts removes an email's history entirely", async () => {
    const email = "cleared@example.com";
    for (let i = 0; i < 5; i++) {
      await recordFailedLoginAttempt(email);
    }

    await clearLoginAttempts(email);

    await expect(assertNotLoginRateLimited(email)).resolves.toBeUndefined();
    expect(await db.loginAttempt.count({ where: { email } })).toBe(0);
  });

  it("deleteOldLoginAttempts removes only rows older than the window, keeping recent ones", async () => {
    const email = "cleanup@example.com";
    await db.loginAttempt.create({
      data: { email, createdAt: new Date(Date.now() - 20 * 60 * 1000) },
    });
    await recordFailedLoginAttempt(email);

    const deletedCount = await deleteOldLoginAttempts();

    expect(deletedCount).toBe(1);
    expect(await db.loginAttempt.count({ where: { email } })).toBe(1);
  });
});
