// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import type {
  assertNotSubmissionRateLimited as AssertNotSubmissionRateLimitedType,
  SubmissionRateLimitedError as SubmissionRateLimitedErrorType,
} from "./submission-rate-limit";

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

const BASE_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
};

async function loadModule(overrides: Record<string, string | undefined> = {}): Promise<{
  assertNotSubmissionRateLimited: typeof AssertNotSubmissionRateLimitedType;
  SubmissionRateLimitedError: typeof SubmissionRateLimitedErrorType;
}> {
  vi.resetModules();
  setEnv({ ...BASE_ENV, ...overrides });
  return import("./submission-rate-limit");
}

describe("idea/edit submission rate limiting (abuse protection)", () => {
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

  it("allows submissions under the configured threshold", async () => {
    const { assertNotSubmissionRateLimited } = await loadModule({
      AI_SUBMISSION_RATE_LIMIT_MAX_ATTEMPTS: "3",
      AI_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: "60",
    });
    const user = await registerUser({ email: "submitter@example.com", password: "password123" });

    await assertNotSubmissionRateLimited(user.id);
    await assertNotSubmissionRateLimited(user.id);

    expect(await db.ideaSubmissionAttempt.count({ where: { userId: user.id } })).toBe(2);
  });

  it("rejects once the configured threshold is reached within the window", async () => {
    const { assertNotSubmissionRateLimited, SubmissionRateLimitedError } = await loadModule({
      AI_SUBMISSION_RATE_LIMIT_MAX_ATTEMPTS: "3",
      AI_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: "60",
    });
    const user = await registerUser({ email: "over-limit@example.com", password: "password123" });

    await assertNotSubmissionRateLimited(user.id);
    await assertNotSubmissionRateLimited(user.id);
    await assertNotSubmissionRateLimited(user.id);

    await expect(assertNotSubmissionRateLimited(user.id)).rejects.toBeInstanceOf(
      SubmissionRateLimitedError,
    );
  });

  it("ignores attempts outside the configured window", async () => {
    const user = await registerUser({
      email: "stale-attempts@example.com",
      password: "password123",
    });
    await db.ideaSubmissionAttempt.createMany({
      data: Array.from({ length: 5 }, () => ({
        userId: user.id,
        createdAt: new Date(Date.now() - 120 * 1000),
      })),
    });
    const { assertNotSubmissionRateLimited } = await loadModule({
      AI_SUBMISSION_RATE_LIMIT_MAX_ATTEMPTS: "3",
      AI_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: "60",
    });

    await expect(assertNotSubmissionRateLimited(user.id)).resolves.toBeUndefined();
  });

  it("scopes the limit per user — another user's attempts never count toward this one's threshold", async () => {
    const user = await registerUser({ email: "user-a@example.com", password: "password123" });
    const otherUser = await registerUser({ email: "user-b@example.com", password: "password123" });
    const { assertNotSubmissionRateLimited, SubmissionRateLimitedError } = await loadModule({
      AI_SUBMISSION_RATE_LIMIT_MAX_ATTEMPTS: "2",
      AI_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: "60",
    });

    await assertNotSubmissionRateLimited(otherUser.id);
    await assertNotSubmissionRateLimited(otherUser.id);
    await expect(assertNotSubmissionRateLimited(otherUser.id)).rejects.toBeInstanceOf(
      SubmissionRateLimitedError,
    );

    // user's own count is unaffected by otherUser's burst.
    await expect(assertNotSubmissionRateLimited(user.id)).resolves.toBeUndefined();
  });

  it("uses the real default (20 per 60s) when unconfigured, not an invented threshold", async () => {
    const { assertNotSubmissionRateLimited } = await loadModule();
    const user = await registerUser({
      email: "default-limit@example.com",
      password: "password123",
    });

    for (let i = 0; i < 20; i++) {
      await assertNotSubmissionRateLimited(user.id);
    }

    expect(await db.ideaSubmissionAttempt.count({ where: { userId: user.id } })).toBe(20);
  });
});
