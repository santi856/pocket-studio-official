import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { generateInitialBlueprint } from "./blueprint-generator";
import { generateBuildPlan } from "./build-planner";
import { syncOutputTargetStatus } from "./pwa";
import { setTruthStatus } from "@/lib/product/truth-status";
import { recordEvent } from "@/lib/product/events";
import type { SemanticCoverageReport } from "./semantic-coverage";
import type { Blueprint, BuildPlan } from "@/generated/prisma/client";

export type GenerationResult = {
  blueprint: Blueprint;
  buildPlan: BuildPlan;
  status: "GENERATED" | "BLOCKED";
};

/**
 * The single generation call (Master Spec §25) that ties the Blueprint
 * Engine (P2-01), Component Registry (P2-02), Build Planner (P2-03),
 * generated-app data layer (P2-04), and Structured Renderer (P2-05)
 * together: generates a fresh Blueprint from the project's current Product
 * State, plans a Build Plan from it, and honestly records whether the
 * result is ready to serve live (`GENERATED`, when the Build Plan's own
 * `planStatus` is `READY`) or `BLOCKED` (mirroring the Build Plan's own
 * blockers — never silently treated as ready). Truth Status for
 * `generation.full_stack_web_app` is synced to this project's *actual*
 * outcome, not the platform-wide roadmap fact that a full generation
 * pipeline now exists — those are different claims (Master Spec §53).
 */
export async function generateApplication(
  actorUserId: string,
  projectId: string,
): Promise<GenerationResult> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const blueprint = await generateInitialBlueprint(actorUserId, projectId);
  const buildPlan = await generateBuildPlan(actorUserId, projectId);

  const status: GenerationResult["status"] =
    buildPlan.planStatus === "READY" ? "GENERATED" : "BLOCKED";

  // Founder-directed follow-up to D-0065 (semantic hollowing): the
  // founder's original complaint (item 6) was specifically that Truth
  // Status described the generated application more strongly than the
  // customer-perceived result justified — "IMPLEMENTED" read as "your
  // product was built," not "some structurally valid screens exist,
  // which may or may not represent what you described." This reads the
  // same generationMetadata.semanticCoverage the Quality Gate's hard
  // rejection check now consumes (quality-gate.ts) and folds it directly
  // into the rationale a founder sees the moment generation completes —
  // not only when they separately choose to run the Quality Gate.
  const blueprintGenerationMetadata = blueprint.generationMetadata as {
    semanticCoverage?: SemanticCoverageReport;
    basedOnSemanticModelVersion?: number | null;
  } | null;
  const semanticCoverage = blueprintGenerationMetadata?.semanticCoverage;
  const semanticCoverageAdequate = semanticCoverage?.overallStatus !== "materially_incomplete";
  // Round 5 independent review (post-D-0072) Finding, DEFECT: blueprint-
  // generator.ts always computes and writes generationMetadata.
  // semanticCoverage, even when no ProductSemanticModel exists at all (an
  // empty extraction trivially reports "adequate" — nothing to be
  // missing) — so `!semanticCoverage` below could never actually be true
  // through this code path, and semantic.fidelity silently claimed
  // IMPLEMENTED for projects that were never evaluated. The real signal
  // for "was a semantic model computed at all" is
  // basedOnSemanticModelVersion (already recorded by blueprint-generator.ts
  // from `semanticModel?.version ?? null`), not the presence of the
  // always-populated coverage object.
  const hasSemanticModel = blueprintGenerationMetadata?.basedOnSemanticModelVersion != null;

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "generation.full_stack_web_app",
    subjectLabel: "Generated, working full-stack web application from Product State",
    status: status === "GENERATED" ? "IMPLEMENTED" : "BLOCKED",
    rationale:
      status === "GENERATED"
        ? semanticCoverageAdequate
          ? `Blueprint v${blueprint.version} and Build Plan v${buildPlan.version} are ready; screens are live at /preview/<screen>.`
          : `Blueprint v${blueprint.version} and Build Plan v${buildPlan.version} are ready and screens are live at /preview/<screen>, but semantic coverage is incomplete — the generated product may not fully represent the description's actors, entities, or workflows. See the Blueprint's own open decisions and quality.semanticFidelity for specifics.`
        : `Build Plan v${buildPlan.version} is blocked: ${(buildPlan.blockers as string[]).join("; ")}`,
  });

  // A dedicated, always-recorded axis (same "one subjectKey per real
  // axis" pattern already used for output.web/output.pwa/quality.*) so a
  // founder can see semantic fidelity as its own signal in Simple Mode's
  // Trust panel without first choosing to run the separate Quality Gate
  // action. Recorded even when there is no semantic model at all (older
  // projects predating this repair) — NOT_EVALUATED, never a false
  // IMPLEMENTED claim about a dimension that was never actually checked.
  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "semantic.fidelity",
    subjectLabel: "Semantic fidelity (generated content represents what the customer described)",
    status: !hasSemanticModel
      ? "NOT_EVALUATED"
      : semanticCoverageAdequate
        ? "IMPLEMENTED"
        : "BLOCKED",
    rationale: !hasSemanticModel
      ? "No semantic model has been computed for this project (predates the Semantic Product Compiler, or extraction did not run) — semantic fidelity has not been evaluated."
      : semanticCoverageAdequate
        ? "Every actor, entity, and workflow the Semantic Product Compiler identified is represented in this Blueprint."
        : "The description appears substantial enough to name at least one actor, but the generated product does not represent it — review the original description manually.",
  });

  await recordEvent(actorUserId, projectId, {
    type: "GENERATION_COMPLETED",
    summary: `Generation ${status.toLowerCase()} — Blueprint v${blueprint.version}, Build Plan v${buildPlan.version}.`,
    data: {
      status,
      blueprintVersion: blueprint.version,
      buildPlanVersion: buildPlan.version,
      blockerCount: (buildPlan.blockers as string[]).length,
    },
  });

  await syncOutputTargetStatus(actorUserId, projectId);

  return { blueprint, buildPlan, status };
}
