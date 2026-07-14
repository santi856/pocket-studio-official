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
    });

    expect(user.email).toBe("login@example.com");
  });

  it("rejects an incorrect password", async () => {
    await registerUser({ email: "login2@example.com", password: "the-right-password" });

    await expect(
      authenticateUser({ email: "login2@example.com", password: "the-wrong-password" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects a login for an email that was never registered", async () => {
    await expect(
      authenticateUser({ email: "nobody@example.com", password: "anything" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("locks out further attempts after 5 failed logins within the window, even with the correct password (P3-02 brute-force protection)", async () => {
    await registerUser({ email: "lockout@example.com", password: "the-right-password" });

    for (let i = 0; i < 5; i++) {
      await expect(
        authenticateUser({ email: "lockout@example.com", password: "wrong" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await expect(
      authenticateUser({ email: "lockout@example.com", password: "the-right-password" }),
    ).rejects.toBeInstanceOf(TooManyLoginAttemptsError);
  });

  it("locks out an email with no account identically to one that exists — an attacker cannot distinguish the two by rate-limit behavior", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        authenticateUser({ email: "never-registered@example.com", password: "anything" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await expect(
      authenticateUser({ email: "never-registered@example.com", password: "anything" }),
    ).rejects.toBeInstanceOf(TooManyLoginAttemptsError);
  });

  it("clears the attempt history on a successful login, so a fresh run of failures can occur again afterward", async () => {
    await registerUser({ email: "recovers@example.com", password: "the-right-password" });

    for (let i = 0; i < 4; i++) {
      await expect(
        authenticateUser({ email: "recovers@example.com", password: "wrong" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await authenticateUser({ email: "recovers@example.com", password: "the-right-password" });

    // Still under the 5-attempt threshold post-reset — proves the counter
    // was cleared, not merely not-yet-tripped.
    for (let i = 0; i < 4; i++) {
      await expect(
        authenticateUser({ email: "recovers@example.com", password: "wrong" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
  });
});
