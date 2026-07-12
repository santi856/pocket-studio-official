import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { generateApplication } from "./generation-orchestrator";
import type { GenerationResult } from "./generation-orchestrator";
import type { JobRun, JobType, Prisma } from "@/generated/prisma/client";

/**
 * Master Spec §29: "Handle: model timeouts; invalid output; ...; partial
 * generation; failed validation; ...; job interruption. Use: durable jobs;
 * checkpoints; retries; idempotency; resumability; ...; clear status."
 * `generateApplication` (P2-06) is wrapped, not modified — this keeps the
 * risk of this unit isolated to the new wrapper rather than touching
 * already-shipped, already-tested generation code (the same caution
 * applied in P2-12/D-0033). Checkpointing is coarse-grained (before/after
 * the whole generation call, not its internal sub-steps) — an honest,
 * disclosed limitation, not full step-by-step resumability.
 */

async function findExistingJobRun(
  projectId: string,
  jobType: JobType,
  idempotencyKey: string,
): Promise<JobRun | null> {
  return db.jobRun.findUnique({
    where: { projectId_jobType_idempotencyKey: { projectId, jobType, idempotencyKey } },
  });
}

export type StartJobRunResult = { job: JobRun; alreadySucceeded: boolean };

/**
 * Idempotency (§29): a caller retrying the same logical request with the
 * same `idempotencyKey` gets back the existing PENDING/RUNNING/SUCCEEDED
 * job rather than starting a duplicate — except a FAILED job, which is a
 * genuine retry: attempt count increments and status returns to RUNNING.
 */
export async function startOrGetJobRun(
  actorUserId: string,
  projectId: string,
  jobType: JobType,
  idempotencyKey?: string,
): Promise<StartJobRunResult> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  if (idempotencyKey) {
    const existing = await findExistingJobRun(projectId, jobType, idempotencyKey);
    if (existing) {
      if (existing.status === "FAILED") {
        const retried = await db.jobRun.update({
          where: { id: existing.id },
          data: {
            status: "RUNNING",
            attempt: existing.attempt + 1,
            error: null,
            startedAt: new Date(),
          },
        });
        return { job: retried, alreadySucceeded: false };
      }
      return { job: existing, alreadySucceeded: existing.status === "SUCCEEDED" };
    }
  }

  const job = await db.jobRun.create({
    data: { projectId, jobType, status: "RUNNING", idempotencyKey, startedAt: new Date() },
  });
  return { job, alreadySucceeded: false };
}

export async function recordJobCheckpoint(
  jobId: string,
  checkpoint: Prisma.InputJsonValue,
): Promise<JobRun> {
  return db.jobRun.update({ where: { id: jobId }, data: { checkpoint } });
}

export async function completeJobRun(jobId: string): Promise<JobRun> {
  return db.jobRun.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED", completedAt: new Date() },
  });
}

export async function failJobRun(jobId: string, error: string): Promise<JobRun> {
  return db.jobRun.update({
    where: { id: jobId },
    data: { status: "FAILED", error, completedAt: new Date() },
  });
}

export async function getJobRun(
  actorUserId: string,
  projectId: string,
  jobId: string,
): Promise<JobRun | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");
  return db.jobRun.findFirst({ where: { id: jobId, projectId } });
}

export async function listJobRuns(actorUserId: string, projectId: string): Promise<JobRun[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");
  return db.jobRun.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
}

export type RunGenerationJobResult = { job: JobRun; result?: GenerationResult };

/**
 * The one wired durable job today: generation. An idempotent caller (same
 * `idempotencyKey`) that already succeeded gets the existing job back
 * without regenerating; a failure is recorded on the job (status FAILED,
 * real error message) and re-thrown — job tracking must never swallow a
 * real error, only record it, per §29's "clear status."
 */
export async function runGenerationJob(
  actorUserId: string,
  projectId: string,
  idempotencyKey?: string,
): Promise<RunGenerationJobResult> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const { job, alreadySucceeded } = await startOrGetJobRun(
    actorUserId,
    projectId,
    "GENERATION",
    idempotencyKey,
  );
  if (alreadySucceeded) {
    return { job };
  }

  await recordJobCheckpoint(job.id, { step: "generation_started" });
  try {
    const result = await generateApplication(actorUserId, projectId);
    await recordJobCheckpoint(job.id, { step: "generation_completed", status: result.status });
    const completed = await completeJobRun(job.id);
    return { job: completed, result };
  } catch (error) {
    await failJobRun(job.id, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
