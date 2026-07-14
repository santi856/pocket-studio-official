// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { sendEmail } from "./send-email";

describe("sendEmail (mock provider — default env)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("records a real SENT row for a successful send", async () => {
    const record = await sendEmail({
      to: "customer@example.com",
      subject: "Welcome to Pocket Studio",
      text: "Thanks for signing up.",
    });

    expect(record.status).toBe("SENT");
    expect(record.provider).toBe("mock");
    expect(record.toAddress).toBe("customer@example.com");
    expect(record.providerMessageId).toBeTruthy();

    const stored = await db.sentEmail.findUnique({ where: { id: record.id } });
    expect(stored).not.toBeNull();
  });

  it("records a real FAILED row for a rejected send, never silently dropping it", async () => {
    const record = await sendEmail({
      to: "not-an-email",
      subject: "Welcome",
      text: "Hello",
    });

    expect(record.status).toBe("FAILED");
    expect(record.failureReason).toBeTruthy();
    expect(record.providerMessageId).toBeNull();
  });

  it("correlates a send with a userId when provided", async () => {
    const record = await sendEmail({
      to: "customer@example.com",
      subject: "Welcome",
      text: "Hello",
      userId: "user_123",
    });

    expect(record.userId).toBe("user_123");
  });

  it("does not require a userId — email is a platform-level concern, not tenant-scoped", async () => {
    const record = await sendEmail({
      to: "customer@example.com",
      subject: "Welcome",
      text: "Hello",
    });

    expect(record.userId).toBeNull();
  });
});
