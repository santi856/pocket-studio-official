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
  // Stage 3 (D-0081/D-0082, STAGE_2_ARCHITECTURE_PROPOSAL.md Migration Plan
  // Phase 2): selects the keyword-based classifier (existing, unchanged,
  // analyzeImpact()) or the new graph-traversal analysis
  // (analyzeGraphImpact()) for conversational edits. Defaults to "keyword"
  // until real generation traffic proves the graph's edge coverage is
  // sufficient — flipping this back requires no data migration, since the
  // keyword classifier is untouched, not deleted.
  IMPACT_ANALYSIS_MODE: z.enum(["keyword", "graph"]).default("keyword"),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Optional, deliberately unset by default (Master Spec §61 "cost
  // tracking") — this build never hardcodes a specific dollar-per-token
  // rate it cannot verify is current; real token counts are always
  // recorded, but a dollar estimate is only computed once an operator
  // configures a real, current rate here.
  AI_COST_PER_1K_INPUT_TOKENS_CENTS: z.coerce.number().nonnegative().optional(),
  AI_COST_PER_1K_OUTPUT_TOKENS_CENTS: z.coerce.number().nonnegative().optional(),
  BILLING_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // No platform-level secret to validate here — unlike BILLING_PROVIDER
  // (Pocket Studio's own Stripe account), a real charge always
  // authenticates with the *customer's own* connected account token
  // (P3-05 OAuth), never a platform-wide credential.
  GENERATED_APP_PAYMENT_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
  // SMTP, not a specific vendor's REST API — the one universal,
  // vendor-agnostic standard for sending email (RFC 5321), so this works
  // with any real provider (SES, Postmark, SendGrid, a plain relay, etc.)
  // via configuration alone, the same "pick no specific vendor" posture
  // already taken for OAuth (P3-05).
  EMAIL_PROVIDER: z.enum(["mock", "smtp"]).default("mock"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  // Base64-encoded 32-byte (256-bit) AES-256-GCM key for the credential
  // vault (Master Spec §4.7, §30). Generate with: openssl rand -base64 32
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "CREDENTIAL_ENCRYPTION_KEY must decode from base64 to exactly 32 bytes",
    ),
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

  if (
    parsed.data.BILLING_PROVIDER === "stripe" &&
    (!parsed.data.STRIPE_SECRET_KEY || !parsed.data.STRIPE_WEBHOOK_SECRET)
  ) {
    throw new Error(
      "BILLING_PROVIDER=stripe requires both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. " +
        "Set BILLING_PROVIDER=mock to run without a live provider.",
    );
  }

  if (
    parsed.data.EMAIL_PROVIDER === "smtp" &&
    (!parsed.data.SMTP_HOST ||
      !parsed.data.SMTP_PORT ||
      !parsed.data.SMTP_USERNAME ||
      !parsed.data.SMTP_PASSWORD ||
      !parsed.data.EMAIL_FROM_ADDRESS)
  ) {
    throw new Error(
      "EMAIL_PROVIDER=smtp requires SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, and " +
        "EMAIL_FROM_ADDRESS. Set EMAIL_PROVIDER=mock to run without a live provider.",
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
