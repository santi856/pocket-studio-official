// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import {
  assertNotLoginRateLimited,
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

  async function recordAttempts(email: string, ipAddress: string, count: number) {
    for (let i = 0; i < count; i++) {
      await db.$transaction((tx) => recordFailedLoginAttempt(tx, email, ipAddress));
    }
  }

  it("does not rate-limit before the threshold is reached", async () => {
    await recordAttempts("threshold@example.com", "1.1.1.1", 4);

    await expect(
      db.$transaction((tx) =>
        assertNotLoginRateLimited(tx, "threshold@example.com", "1.1.1.1", null),
      ),
    ).resolves.toBeUndefined();
  });

  it("rate-limits once the threshold is reached", async () => {
    await recordAttempts("over-threshold@example.com", "1.1.1.1", 5);

    await expect(
      db.$transaction((tx) =>
        assertNotLoginRateLimited(tx, "over-threshold@example.com", "1.1.1.1", null),
      ),
    ).rejects.toBeInstanceOf(TooManyLoginAttemptsError);
  });

  it("regression (D-0053): attempts from a different IP never count toward another IP's threshold for the same email — closes the email-only account-lockout DoS", async () => {
    await recordAttempts("victim@example.com", "attacker.ip", 5);

    // The legitimate owner, attempting from their own IP, is unaffected —
    // an attacker who only knows the victim's email cannot lock them out.
    await expect(
      db.$transaction((tx) =>
        assertNotLoginRateLimited(tx, "victim@example.com", "victims-real-ip", null),
      ),
    ).resolves.toBeUndefined();

    // The attacker's own (email, ip) pair is correctly throttled.
    await expect(
      db.$transaction((tx) =>
        assertNotLoginRateLimited(tx, "victim@example.com", "attacker.ip", null),
      ),
    ).rejects.toBeInstanceOf(TooManyLoginAttemptsError);
  });

  it("ignores attempts outside the 15-minute window", async () => {
    const email = "stale@example.com";
    await db.loginAttempt.createMany({
      data: Array.from({ length: 5 }, () => ({
        email,
        ipAddress: "1.1.1.1",
        createdAt: new Date(Date.now() - 16 * 60 * 1000),
      })),
    });

    await expect(
      db.$transaction((tx) => assertNotLoginRateLimited(tx, email, "1.1.1.1", null)),
    ).resolves.toBeUndefined();
  });

  it("regression (D-0053): attempts before lastLoginAt are excluded, without deleting any LoginAttempt history", async () => {
    const email = "recovered@example.com";
    const ipAddress = "1.1.1.1";
    await recordAttempts(email, ipAddress, 4);
    const loginTime = new Date();
    await new Promise((resolve) => setTimeout(resolve, 5));

    // A fresh run of failures after the successful login must not be
    // blocked by the 4 pre-login attempts still sitting in the table.
    await expect(
      db.$transaction((tx) => assertNotLoginRateLimited(tx, email, ipAddress, loginTime)),
    ).resolves.toBeUndefined();

    // The full history — including the pre-login attempts — is still
    // there; nothing was deleted on success.
    expect(await db.loginAttempt.count({ where: { email, ipAddress } })).toBe(4);
  });

  it("normalizes are the caller's responsibility — assertNotLoginRateLimited itself matches exactly on the (email, ipAddress) pair given", async () => {
    await recordAttempts("case@example.com", "1.1.1.1", 5);

    // A differently-cased email is a *different* key at this layer — case
    // normalization happens once, in authenticateUser, before either
    // primitive is ever called (verified end to end in
    // users.integration.test.ts).
    await expect(
      db.$transaction((tx) => assertNotLoginRateLimited(tx, "Case@Example.com", "1.1.1.1", null)),
    ).resolves.toBeUndefined();
  });

  describe("deleteOldLoginAttempts", () => {
    it("removes only rows older than the window, keeping recent ones", async () => {
      const email = "cleanup@example.com";
      await db.loginAttempt.create({
        data: { email, ipAddress: "1.1.1.1", createdAt: new Date(Date.now() - 20 * 60 * 1000) },
      });
      await db.$transaction((tx) => recordFailedLoginAttempt(tx, email, "1.1.1.1"));

      const deletedCount = await deleteOldLoginAttempts();

      expect(deletedCount).toBe(1);
      expect(await db.loginAttempt.count({ where: { email } })).toBe(1);
    });

    it("regression (D-0053): respects a batch size bound rather than deleting an unbounded number of rows at once", async () => {
      const staleTime = new Date(Date.now() - 20 * 60 * 1000);
      await db.loginAttempt.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          email: `bulk-${i}@example.com`,
          ipAddress: "1.1.1.1",
          createdAt: staleTime,
        })),
      });

      const deletedCount = await deleteOldLoginAttempts(3);

      expect(deletedCount).toBe(3);
      expect(await db.loginAttempt.count()).toBe(7);
    });
  });
});
