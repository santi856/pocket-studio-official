import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env";

/**
 * Next.js dev mode reloads modules on every request, which would otherwise
 * create a new connection pool each time. Caching the client on `globalThis`
 * survives hot reloads in development; production always gets a fresh
 * singleton per process.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function resolveConnectionString(): string {
  const env = getServerEnv();

  // Integration tests run against a dedicated database (see
  // docker/postgres-init/01-create-test-db.sql) so they never read or
  // mutate development data. TEST_DATABASE_URL is deliberately outside the
  // zod-validated server env contract: it is a test-harness concern, not
  // part of the application's runtime contract.
  if (env.NODE_ENV === "test" && process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  return env.DATABASE_URL;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: resolveConnectionString() });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
