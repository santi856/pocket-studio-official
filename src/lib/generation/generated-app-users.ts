import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { hashPassword } from "@/lib/auth/password";
import type { GeneratedAppUser } from "@/generated/prisma/client";

const MIN_PASSWORD_LENGTH = 8;

export class WeakGeneratedAppUserPasswordError extends Error {
  constructor() {
    super(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    this.name = "WeakGeneratedAppUserPasswordError";
  }
}

export class GeneratedAppUserEmailAlreadyExistsError extends Error {
  constructor() {
    super("A user with this email already exists for this project.");
    this.name = "GeneratedAppUserEmailAlreadyExistsError";
  }
}

export type CreateGeneratedAppUserInput = {
  email: string;
  password: string;
  name?: string;
  role: string;
};

/**
 * A generated product's own end-user identity (Master Spec §25) — the
 * person booking a detailing appointment, not a Pocket Studio account
 * holder. Scoped to a project, not global: two different generated
 * products may share an end user's email address without conflict.
 * Reuses the platform's own password hashing (src/lib/auth/password.ts)
 * rather than inventing a second implementation.
 */
export async function createGeneratedAppUser(
  actorUserId: string,
  projectId: string,
  input: CreateGeneratedAppUserInput,
): Promise<GeneratedAppUser> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakGeneratedAppUserPasswordError();
  }

  const existing = await db.generatedAppUser.findUnique({
    where: { projectId_email: { projectId, email: input.email } },
  });
  if (existing) {
    throw new GeneratedAppUserEmailAlreadyExistsError();
  }

  const passwordHash = await hashPassword(input.password);

  return db.generatedAppUser.create({
    data: {
      projectId,
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
    },
  });
}

export async function listGeneratedAppUsers(
  actorUserId: string,
  projectId: string,
): Promise<GeneratedAppUser[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.generatedAppUser.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getGeneratedAppUser(
  actorUserId: string,
  projectId: string,
  generatedAppUserId: string,
): Promise<GeneratedAppUser | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.generatedAppUser.findFirst({
    where: { id: generatedAppUserId, projectId },
  });
}
