import { db } from "@/lib/db";

/**
 * Deletes in FK-dependency order (children before parents). Used between
 * integration tests so each test starts from a known-empty tenant state
 * instead of relying on unique-value gymnastics to avoid collisions.
 */
export async function resetDatabase(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetDatabase() must only run under NODE_ENV=test.");
  }

  await db.session.deleteMany();
  await db.project.deleteMany();
  await db.membership.deleteMany();
  await db.organization.deleteMany();
  await db.user.deleteMany();
}
