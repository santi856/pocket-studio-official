// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createSession, deleteSessionByToken, verifySessionToken } from "@/lib/auth/session";

describe("session lifecycle", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("verifies a freshly created session and returns the owning user", async () => {
    const user = await registerUser({ email: "session@example.com", password: "password123" });
    const { token } = await createSession(user.id);

    const result = await verifySessionToken(token);

    expect(result?.user.id).toBe(user.id);
  });

  it("rejects an unknown token", async () => {
    const result = await verifySessionToken("not-a-real-token");
    expect(result).toBeNull();
  });

  it("stores only a hash of the token, never the raw token", async () => {
    const user = await registerUser({ email: "hash-check@example.com", password: "password123" });
    const { token } = await createSession(user.id);

    const stored = await db.session.findFirst({ where: { userId: user.id } });

    expect(stored?.tokenHash).toBeDefined();
    expect(stored?.tokenHash).not.toBe(token);
  });

  it("invalidates a session after deletion", async () => {
    const user = await registerUser({ email: "logout@example.com", password: "password123" });
    const { token } = await createSession(user.id);

    await deleteSessionByToken(token);

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const user = await registerUser({ email: "expired@example.com", password: "password123" });
    const { token } = await createSession(user.id);

    await db.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await verifySessionToken(token)).toBeNull();
  });
});
