// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { getLatestBlueprint } from "./blueprint";
import { getJobRun, listJobRuns, runGenerationJob, startOrGetJobRun } from "./job-runs";

describe("durable jobs", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    return { owner, project };
  }

  describe("startOrGetJobRun", () => {
    it("creates a new RUNNING job with no idempotency key each time", async () => {
      const { owner, project } = await seedProject();

      const first = await startOrGetJobRun(owner.id, project.id, "GENERATION");
      const second = await startOrGetJobRun(owner.id, project.id, "GENERATION");

      expect(first.job.id).not.toBe(second.job.id);
      expect(first.job.status).toBe("RUNNING");
    });

    it("returns the same job for the same idempotency key while it is still running", async () => {
      const { owner, project } = await seedProject();

      const first = await startOrGetJobRun(owner.id, project.id, "GENERATION", "req-1");
      const second = await startOrGetJobRun(owner.id, project.id, "GENERATION", "req-1");

      expect(second.job.id).toBe(first.job.id);
      expect(second.alreadySucceeded).toBe(false);
    });

    it("survives concurrent calls with the same idempotency key without crashing (Phase 2 Level 3 review round 2, adversarial finding)", async () => {
      const { owner, project } = await seedProject();

      // Two callers racing to start the same idempotent job (e.g. a
      // double-clicked "Export" or "Generate" button) can both pass the
      // "does this job already exist" check before either commits its
      // create — the loser previously crashed on the unique
      // (projectId, jobType, idempotencyKey) constraint instead of
      // deferring to the winner's row.
      const CONCURRENT_CALLERS = 10;
      const results = await Promise.all(
        Array.from({ length: CONCURRENT_CALLERS }, () =>
          startOrGetJobRun(owner.id, project.id, "GENERATION", "race-1"),
        ),
      );

      const jobIds = new Set(results.map((r) => r.job.id));
      expect(jobIds.size).toBe(1);

      const jobs = await listJobRuns(owner.id, project.id);
      expect(jobs).toHaveLength(1);
    });

    it("denies starting a job for an actor without project access", async () => {
      const { project } = await seedProject();
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });

      await expect(startOrGetJobRun(outsider.id, project.id, "GENERATION")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("runGenerationJob", () => {
    it("succeeds and produces a real Blueprint, marking the job SUCCEEDED with a checkpoint", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

      const { job, result } = await runGenerationJob(owner.id, project.id);

      expect(job.status).toBe("SUCCEEDED");
      expect(job.checkpoint).toMatchObject({ step: "generation_completed" });
      expect(result?.status).toBe("GENERATED");
      const blueprint = await getLatestBlueprint(owner.id, project.id);
      expect(blueprint?.version).toBe(1);
    });

    it("is idempotent: a second call with the same key does not regenerate", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

      await runGenerationJob(owner.id, project.id, "req-1");
      const second = await runGenerationJob(owner.id, project.id, "req-1");

      expect(second.result).toBeUndefined();
      const blueprint = await getLatestBlueprint(owner.id, project.id);
      expect(blueprint?.version).toBe(1);
    });

    it("records a real failure, re-throws it, and never silently swallows the error", async () => {
      const { owner, project } = await seedProject();
      // No Product State yet — generateInitialBlueprint will genuinely throw.

      await expect(runGenerationJob(owner.id, project.id, "req-1")).rejects.toThrow();

      const jobs = await listJobRuns(owner.id, project.id);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.status).toBe("FAILED");
      expect(jobs[0]?.error).toBeTruthy();
    });

    it("retries a failed job when called again with the same idempotency key, incrementing attempt", async () => {
      const { owner, project } = await seedProject();

      await expect(runGenerationJob(owner.id, project.id, "req-1")).rejects.toThrow();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      const { job, result } = await runGenerationJob(owner.id, project.id, "req-1");

      expect(job.status).toBe("SUCCEEDED");
      expect(job.attempt).toBe(2);
      expect(result?.status).toBe("GENERATED");

      const jobs = await listJobRuns(owner.id, project.id);
      expect(jobs).toHaveLength(1); // retried in place, not a new row
    });

    it("denies generation jobs for an actor without project access", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });

      await expect(runGenerationJob(outsider.id, project.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("getJobRun / listJobRuns", () => {
    it("scopes job lookups to the requesting project", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      const { job } = await runGenerationJob(owner.id, project.id);

      const fetched = await getJobRun(owner.id, project.id, job.id);
      expect(fetched?.id).toBe(job.id);
    });
  });
});
