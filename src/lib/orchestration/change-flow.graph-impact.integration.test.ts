// @vitest-environment node
//
// Stage 3 (D-0081/D-0082), implementation-order step 9: proves
// beginChangeFlow's IMPACT_ANALYSIS_MODE=graph wiring end-to-end.
//
// getServerEnv() caches its parsed result at module scope for the lifetime
// of a module instance, and `@/lib/db`'s own top-level `createPrismaClient()`
// call reads it as soon as `@/lib/db` (or anything importing it) is first
// evaluated — which happens as soon as ANY of this file's static imports
// resolve, before this file's own body (including a plain
// `process.env.IMPACT_ANALYSIS_MODE = "graph"` statement) ever runs, per
// ESM's "all imports evaluate before the importing module's own top-level
// code" ordering. So setting the env var at the top of the file is too
// late. Instead, each test that needs graph mode sets the env var, then
// uses `vi.resetModules()` + a dynamic `import("./change-flow")` to force a
// fresh `env.ts` module instance that reads the updated `process.env` at
// that point — mirroring env.test.ts's own established pattern for testing
// getServerEnv(). `@/lib/db`'s PrismaClient itself is unaffected: it caches
// its singleton on `globalForPrisma` (a real `globalThis` property, not a
// module-scope variable), so a fresh re-import of `@/lib/db` reuses the
// existing client rather than re-resolving the connection string.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { generateProductIntelligence } from "./product-intelligence";
import { generateInitialBlueprint } from "@/lib/generation/blueprint-generator";
import type { beginChangeFlow as BeginChangeFlow } from "./change-flow";

describe("beginChangeFlow — IMPACT_ANALYSIS_MODE=graph", () => {
  const ORIGINAL_MODE = process.env.IMPACT_ANALYSIS_MODE;

  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterEach(() => {
    if (ORIGINAL_MODE === undefined) {
      delete process.env.IMPACT_ANALYSIS_MODE;
    } else {
      process.env.IMPACT_ANALYSIS_MODE = ORIGINAL_MODE;
    }
    vi.resetModules();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function beginChangeFlowInGraphMode(
    ...args: Parameters<typeof BeginChangeFlow>
  ): ReturnType<typeof BeginChangeFlow> {
    process.env.IMPACT_ANALYSIS_MODE = "graph";
    vi.resetModules();
    const { beginChangeFlow } = await import("./change-flow");
    return beginChangeFlow(...args);
  }

  const PAYNOW_IDEA =
    "PayNow helps small businesses collect payment from customers through a simple checkout " +
    "process. Customers can submit their payment details and complete the workflow.";

  async function seedGeneratedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "PayNow Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "PayNow",
      createdByUserId: owner.id,
    });
    await generateProductIntelligence(owner.id, project.id, PAYNOW_IDEA);
    await generateInitialBlueprint(owner.id, project.id);
    return { owner, project };
  }

  it("enriches the Decision's impact with real graph data for a resolvable edit_request", async () => {
    const { owner, project } = await seedGeneratedProject();

    const result = await beginChangeFlowInGraphMode(
      owner.id,
      project.id,
      "Update the payment process.",
    );

    expect(result.intent.type).toBe("edit_request");
    // disclosureTier stays keyword-classifier-derived, unchanged by graph mode.
    expect(result.decision.disclosureTier).toBe(
      result.impact.consequential ? "CONSEQUENTIAL" : "IMPORTANT",
    );

    const impact = result.decision.impact as {
      categories: string[];
      consequential: boolean;
      graph?: {
        coverage: string;
        directlyAffected: string[];
        transitivelyAffected: string[];
        recommendedExecutionOrder: string[];
        cyclicDependencyWarning: string | null;
      };
    };
    expect(impact.graph).toBeDefined();
    // Payment (DATA_MODEL) <- DEPENDS_ON <- Checkout (SCREEN), direct.
    expect(impact.graph!.directlyAffected).toContain("Checkout");
    // Checkout <- CONTAINS <- Pay (ACTION), transitive from Payment's perspective.
    expect(impact.graph!.transitivelyAffected).toContain("Pay");
    expect(impact.graph!.cyclicDependencyWarning).toBeNull();
  });

  it("falls back to keyword-only impact content when the graph cannot resolve the edit's target", async () => {
    const { owner, project } = await seedGeneratedProject();

    const result = await beginChangeFlowInGraphMode(
      owner.id,
      project.id,
      "Something that was never described in this product.",
    );

    expect(result.intent.type).toBe("edit_request");
    const impact = result.decision.impact as {
      categories: string[];
      consequential: boolean;
      graph?: unknown;
    };
    expect(impact.graph).toBeUndefined();
    expect(impact.categories).toEqual(result.impact.categories);
    expect(impact.consequential).toBe(result.impact.consequential);
  });

  it("does not enrich impact for a describe_idea intent even in graph mode", async () => {
    const owner = await registerUser({ email: "owner2@example.com", password: "password123" });
    const org = await createOrganization({ name: "Fresh Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Fresh Idea",
      createdByUserId: owner.id,
    });

    const result = await beginChangeFlowInGraphMode(owner.id, project.id, PAYNOW_IDEA);

    expect(result.intent.type).toBe("describe_idea");
    const impact = result.decision.impact as {
      categories: string[];
      consequential: boolean;
      graph?: unknown;
    };
    expect(impact.graph).toBeUndefined();
  });
});
