// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import {
  authenticateUser,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  registerUser,
  WeakPasswordError,
} from "@/lib/services/users";
import { TooManyLoginAttemptsError } from "@/lib/auth/login-rate-limit";

const IP = "203.0.113.10";
const OTHER_IP = "203.0.113.20";

describe("registerUser / authenticateUser", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("registers a user with a hashed password, never the plaintext", async () => {
    const user = await registerUser({
      email: "Founder@Example.com",
      password: "correct-horse-battery-staple",
      name: "Founder",
    });

    expect(user.email).toBe("founder@example.com");
    expect(user.passwordHash).not.toBe("correct-horse-battery-staple");
    expect(user.passwordHash).toContain(":");
  });

  it("rejects a password shorter than 8 characters even though the client-side minLength is bypassable", async () => {
    await expect(
      registerUser({ email: "weak@example.com", password: "short1" }),
    ).rejects.toBeInstanceOf(WeakPasswordError);

    const stored = await db.user.findUnique({ where: { email: "weak@example.com" } });
    expect(stored).toBeNull();
  });

  it("rejects registering the same email twice", async () => {
    await registerUser({ email: "dup@example.com", password: "password-one" });

    await expect(
      registerUser({ email: "dup@example.com", password: "password-two" }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it("authenticates with the correct password", async () => {
    await registerUser({ email: "login@example.com", password: "the-right-password" });

    const user = await authenticateUser({
      email: "login@example.com",
      password: "the-right-password",
      ipAddress: IP,
    });

    expect(user.email).toBe("login@example.com");
  });

  it("rejects an incorrect password", async () => {
    await registerUser({ email: "login2@example.com", password: "the-right-password" });

    await expect(
      authenticateUser({
        email: "login2@example.com",
        password: "the-wrong-password",
        ipAddress: IP,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects a login for an email that was never registered", async () => {
    await expect(
      authenticateUser({ email: "nobody@example.com", password: "anything", ipAddress: IP }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("locks out further attempts from the same IP after 5 failed logins within the window, even with the correct password (P3-02 brute-force protection)", async () => {
    await registerUser({ email: "lockout@example.com", password: "the-right-password" });

    for (let i = 0; i < 5; i++) {
      await expect(
        authenticateUser({ email: "lockout@example.com", password: "wrong", ipAddress: IP }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await expect(
      authenticateUser({
        email: "lockout@example.com",
        password: "the-right-password",
        ipAddress: IP,
      }),
    ).rejects.toBeInstanceOf(TooManyLoginAttemptsError);
  });

  it("regression (D-0053): does not lock out the legitimate owner's own IP — closes the email-only account-lockout DoS", async () => {
    await registerUser({ email: "victim@example.com", password: "the-right-password" });

    // An attacker who only knows the victim's email, attempting from their
    // own IP, cannot lock the victim out of their own account.
    for (let i = 0; i < 5; i++) {
      await expect(
        authenticateUser({ email: "victim@example.com", password: "guess", ipAddress: OTHER_IP }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    const user = await authenticateUser({
      email: "victim@example.com",
      password: "the-right-password",
      ipAddress: IP,
    });
    expect(user.email).toBe("victim@example.com");
  });

  it("locks out an email with no account identically to one that exists — an attacker cannot distinguish the two by rate-limit behavior", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        authenticateUser({
          email: "never-registered@example.com",
          password: "anything",
          ipAddress: IP,
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await expect(
      authenticateUser({
        email: "never-registered@example.com",
        password: "anything",
        ipAddress: IP,
      }),
    ).rejects.toBeInstanceOf(TooManyLoginAttemptsError);
  });

  it("regression (D-0053): a nonexistent-user attempt takes real, measurable time — proves the dummy-hash timing-equivalence fix actually runs, not just declared", async () => {
    // scrypt is deliberately slow (tens of milliseconds); a DB miss alone
    // is sub-millisecond. If the nonexistent-user path silently skipped
    // hashing again, this would complete near-instantly and fail this
    // floor — the exact bug this test guards against.
    const start = performance.now();
    await expect(
      authenticateUser({
        email: "nobody-times-two@example.com",
        password: "anything",
        ipAddress: IP,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeGreaterThan(10);
  });

  it("regression (D-0053): does not delete LoginAttempt history on a successful login — only bounds future enforcement to attempts after lastLoginAt", async () => {
    await registerUser({ email: "recovers@example.com", password: "the-right-password" });

    for (let i = 0; i < 4; i++) {
      await expect(
        authenticateUser({ email: "recovers@example.com", password: "wrong", ipAddress: IP }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await authenticateUser({
      email: "recovers@example.com",
      password: "the-right-password",
      ipAddress: IP,
    });

    // All 4 pre-login failures are still there — nothing was deleted.
    expect(
      await db.loginAttempt.count({ where: { email: "recovers@example.com", ipAddress: IP } }),
    ).toBe(4);

    // But a fresh run of failures after the successful login is not
    // blocked by them — enforcement is bounded by lastLoginAt, not by
    // deleting rows.
    for (let i = 0; i < 4; i++) {
      await expect(
        authenticateUser({ email: "recovers@example.com", password: "wrong", ipAddress: IP }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
  });

  it("regression (D-0053): concurrent attempts against the same (email, IP) cannot exceed the threshold — closes the check-then-act race", async () => {
    await registerUser({ email: "race@example.com", password: "the-right-password" });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        authenticateUser({ email: "race@example.com", password: "wrong", ipAddress: IP }),
      ),
    );

    const invalidCredentials = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof InvalidCredentialsError,
    );
    const tooManyAttempts = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof TooManyLoginAttemptsError,
    );

    // Exactly 5 of the 10 concurrent requests actually attempted (and
    // failed) verification; the rest were correctly throttled without
    // ever checking the password. Without the fix, more than 5 could read
    // the same pre-burst count and all attempt verification.
    expect(invalidCredentials).toHaveLength(5);
    expect(tooManyAttempts).toHaveLength(5);
    expect(
      await db.loginAttempt.count({ where: { email: "race@example.com", ipAddress: IP } }),
    ).toBe(5);
  });
});
