import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { generateInitialBlueprint } from "./blueprint-generator";
import { generateBuildPlan } from "./build-planner";
import { setTruthStatus } from "@/lib/product/truth-status";
import { recordEvent } from "@/lib/product/events";
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

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "generation.full_stack_web_app",
    subjectLabel: "Generated, working full-stack web application from Product State",
    status: status === "GENERATED" ? "IMPLEMENTED" : "BLOCKED",
    rationale:
      status === "GENERATED"
        ? `Blueprint v${blueprint.version} and Build Plan v${buildPlan.version} are ready; screens are live at /preview/<screen>.`
        : `Build Plan v${buildPlan.version} is blocked: ${(buildPlan.blockers as string[]).join("; ")}`,
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

  return { blueprint, buildPlan, status };
}
