import "server-only";
import { createHash } from "node:crypto";

/**
 * Deterministic, stable across regenerations of the same source text — a
 * requirement re-extracted from unchanged text gets the same ID every
 * time, rather than a fresh random one, so traceability (Blueprint content
 * → Build Plan task → generated test → evidence → Truth Status) survives
 * regeneration. Not cryptographically sensitive; a short hash is enough to
 * make collisions between genuinely different requirements implausible
 * within one project's scope.
 */
export function deriveRequirementId(kind: string, normalizedText: string): string {
  const hash = createHash("sha256")
    .update(`${kind}:${normalizedText.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 10);
  return `req_${hash}`;
}
