import { z } from "zod";

/**
 * Server-only environment contract. Import this module only from server
 * code (Server Components, Route Handlers, Server Actions). Importing it
 * from a Client Component is a compile-time error because `server-only`
 * fails the build if bundled into a client chunk — this is how Master
 * Spec §4.7 ("secrets never belong in chat" / never in browser bundles)
 * is enforced mechanically rather than by convention.
 */
import "server-only";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  AI_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

/**
 * Parses and caches process.env once. Throws with a readable, aggregated
 * error at startup rather than letting individual reads fail confusingly
 * deep in request handling.
 */
export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  if (parsed.data.AI_PROVIDER === "anthropic" && !parsed.data.ANTHROPIC_API_KEY) {
    throw new Error(
      "AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY. Set AI_PROVIDER=mock to run without a live provider.",
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
