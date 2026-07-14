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

// P3-02 production hardening: previously an unbounded pg.Pool default —
// under real concurrent load, an unbounded pool can itself exhaust
// Postgres's own connection limit (a self-inflicted outage, not a
// database problem). These are conservative, documented starting values
// for a single-process deployment, not load-tested against a specific
// production topology yet — revisit once real deployment infrastructure
// (P3-08) is in place.
const POOL_MAX_CONNECTIONS = 10;
const POOL_IDLE_TIMEOUT_MS = 30_000;
const POOL_CONNECTION_TIMEOUT_MS = 10_000;
// Guards against one runaway query holding a connection indefinitely and
// starving the rest of the pool.
const STATEMENT_TIMEOUT_MS = 30_000;

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(
    {
      connectionString: resolveConnectionString(),
      max: POOL_MAX_CONNECTIONS,
      idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
    },
    {
      // pg.Pool emits 'error' on idle-client failures (e.g. the database
      // restarting); without a listener, that is an uncaught event that
      // crashes the whole Node process — a well-known pg.Pool footgun, not
      // hypothetical. Logging and continuing is correct: the pool recovers
      // affected connections on its own for the next query.
      onPoolError: (error) => {
        console.error("Postgres connection pool error:", error);
      },
    },
  );
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
