import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { createNextVersion } from "./db-versioning";

function versionConflictError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("createNextVersion", () => {
  it("returns the result on the first successful attempt", async () => {
    const createFn = vi.fn().mockResolvedValue("created");

    const result = await createNextVersion(createFn);

    expect(result).toBe("created");
    expect(createFn).toHaveBeenCalledTimes(1);
  });

  it("retries on a P2002 version-conflict error and succeeds once the race clears", async () => {
    const createFn = vi
      .fn()
      .mockRejectedValueOnce(versionConflictError())
      .mockRejectedValueOnce(versionConflictError())
      .mockResolvedValue("created after retries");

    const result = await createNextVersion(createFn);

    expect(result).toBe("created after retries");
    expect(createFn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-conflict error — propagates immediately", async () => {
    const unrelatedError = new Error("some other failure");
    const createFn = vi.fn().mockRejectedValue(unrelatedError);

    await expect(createNextVersion(createFn)).rejects.toBe(unrelatedError);
    expect(createFn).toHaveBeenCalledTimes(1);
  });

  it("gives up and throws after exhausting its retry budget on persistent conflicts", async () => {
    const createFn = vi.fn().mockRejectedValue(versionConflictError());

    await expect(createNextVersion(createFn)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    expect(createFn.mock.calls.length).toBeGreaterThan(1);
  });
});
