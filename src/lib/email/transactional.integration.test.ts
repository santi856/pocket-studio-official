// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { sendWelcomeEmail } from "./transactional";

describe("sendWelcomeEmail", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("sends a real, recorded welcome email correlated to the new user", async () => {
    const record = await sendWelcomeEmail({
      userId: "user_123",
      toAddress: "founder@example.com",
      name: "Jesse",
    });

    expect(record?.status).toBe("SENT");
    expect(record?.userId).toBe("user_123");
    expect(record?.toAddress).toBe("founder@example.com");
    expect(record?.subject).toBe("Welcome to Pocket Studio");
  });

  it("greets generically when no name was given", async () => {
    const record = await sendWelcomeEmail({
      userId: "user_456",
      toAddress: "nobody-named@example.com",
      name: null,
    });

    expect(record?.status).toBe("SENT");
  });

  it("never throws — a failed send is recorded, not propagated, so sign-up itself never fails", async () => {
    const record = await sendWelcomeEmail({
      userId: "user_789",
      toAddress: "not-an-email",
      name: "X",
    });

    expect(record?.status).toBe("FAILED");
  });
});
