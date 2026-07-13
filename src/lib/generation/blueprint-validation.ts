import "server-only";
import type { BlueprintValidationStatus } from "@/generated/prisma/client";
import { validateInteractionContracts, workflowContractKey } from "./interaction-contracts";
import type { InteractionContractMap } from "./interaction-contracts";

export type BlueprintValidationInput = {
  schemaVersion: string;
  productType: string | null;
  roles: string[];
  screens: string[];
  outputTargets: string[];
  dataModels: Array<{ name: string; fields: string[] }>;
  requirements: unknown[];
  workflows: Array<{ name: string }>;
  // Required (P2-EXIT hardening): a caller that omits this entirely
  // previously caused interaction-contract completeness to be silently
  // skipped rather than checked, which is exactly the "silently omit an
  // applicable interaction contract" failure mode this field exists to
  // prevent. Every caller must now supply its real contract map (or an
  // honestly empty one, which correctly fails validation if screens or
  // workflows exist) — see src/lib/generation/interaction-contracts.ts.
  interactionContracts: InteractionContractMap;
};

export type BlueprintValidationResult = {
  status: BlueprintValidationStatus;
  errors: string[];
};

// Only targets this build can actually attempt to generate against today
// (Master Spec §54-59 scopes Phase 2 to web/PWA; mobile output is P2-15).
const SUPPORTED_OUTPUT_TARGETS = new Set(["web", "pwa"]);

/**
 * Master Spec §23: "Invalid Blueprints may not proceed as successful
 * builds." Structural validation only — this can confirm a Blueprint is
 * complete and internally consistent enough to attempt a build against; it
 * cannot judge whether its content is a *good* design.
 */
export function validateBlueprint(input: BlueprintValidationInput): BlueprintValidationResult {
  const errors: string[] = [];

  if (!input.schemaVersion) errors.push("schemaVersion is required.");
  if (!input.productType) errors.push("productType is required.");
  if (input.roles.length === 0) errors.push("At least one role is required.");
  if (input.screens.length === 0) errors.push("At least one screen is required.");
  if (input.requirements.length === 0) errors.push("At least one requirement is required.");
  if (input.outputTargets.length === 0) {
    errors.push("At least one output target is required.");
  }
  for (const target of input.outputTargets) {
    if (!SUPPORTED_OUTPUT_TARGETS.has(target)) {
      errors.push(`Output target "${target}" is not currently supported for generation.`);
    }
  }
  for (const model of input.dataModels) {
    if (!model.name || model.fields.length === 0) {
      errors.push(
        `Data model "${model.name || "(unnamed)"}" must have a name and at least one field.`,
      );
    }
  }

  // Every screen AND every workflow must have a well-formed interaction
  // contract — not just screens, closing the gap where a workflow's
  // contract was computed and stored but never structurally validated.
  const contractSubjects = [
    ...input.screens,
    ...input.workflows.map((workflow) => workflowContractKey(workflow.name)),
  ];
  errors.push(
    ...validateInteractionContracts(contractSubjects, input.interactionContracts).violations,
  );

  return { status: errors.length === 0 ? "VALID" : "INVALID", errors };
}
