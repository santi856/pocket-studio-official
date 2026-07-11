// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import {
  authenticateUser,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  registerUser,
} from "@/lib/services/users";

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
});
