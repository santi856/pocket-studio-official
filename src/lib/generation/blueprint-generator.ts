import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestProductState, NoProductStateError } from "@/lib/product/product-state";
import { getLatestProductDNA } from "@/lib/product/product-dna";
import { listProductMemoryEntries } from "@/lib/product/product-memory";
import { createKnowledgeNode } from "@/lib/product/product-knowledge";
import { recordEvent } from "@/lib/product/events";
import { deriveRequirements } from "@/lib/orchestration/requirements-engine";
import {
  BLUEPRINT_CATEGORY_TEMPLATES,
  BASE_SCREENS,
  CUSTOMER_ROLE,
  OWNER_ROLE,
} from "./blueprint-templates";
import { validateBlueprint } from "./blueprint-validation";
import { createBlueprintVersion } from "./blueprint";
import {
  inferScreenPatterns,
  inferWorkflowPatterns,
  workflowContractKey,
} from "./interaction-contracts";
import type { InteractionContractMap } from "./interaction-contracts";
import type { Blueprint, Prisma } from "@/generated/prisma/client";

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Deterministically derives an initial Blueprint (Master Spec §23) from a
 * project's existing Canonical Product State, Product DNA, and Requirements
 * Engine output — the same three sources P1-06 already computed. Every
 * Blueprint field is grounded in one of those sources or a fixed template
 * keyed off an Impact Analysis category that source already touched; no
 * field is invented. Honestly labeled via `generationMetadata` as
 * deterministic, not AI-authored design (real AI-backed generation is Phase
 * 3 scope, §61).
 */
export async function generateInitialBlueprint(
  actorUserId: string,
  projectId: string,
): Promise<Blueprint> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const productState = await getLatestProductState(actorUserId, projectId);
  if (!productState) {
    throw new NoProductStateError();
  }
  const productDNA = await getLatestProductDNA(actorUserId, projectId);
  const memoryEntries = await listProductMemoryEntries(actorUserId, projectId);

  const requirements = deriveRequirements(productState.originalIdea);
  const categories = uniq(requirements.map((requirement) => requirement.category));

  const screens = uniq([
    ...BASE_SCREENS,
    ...categories.flatMap((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.screens ?? []),
  ]);
  const actions = uniq(
    categories.flatMap((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.actions ?? []),
  );
  const workflows = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.workflow)
    .filter((workflow): workflow is { name: string; steps: string[] } => Boolean(workflow));
  const dataModels = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.dataModel)
    .filter((model): model is { name: string; fields: string[] } => Boolean(model));
  const businessRules = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.businessRule)
    .filter((rule): rule is string => Boolean(rule));
  const permissionNotes = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.permission)
    .filter((note): note is string => Boolean(note));
  const monetizationNotes = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.monetization)
    .filter((note): note is string => Boolean(note));

  const hasPermissionsCategory = categories.includes("permissions");
  const roles = hasPermissionsCategory ? [CUSTOMER_ROLE, OWNER_ROLE] : [CUSTOMER_ROLE];

  // Product Pattern and Interaction Contract System: attach the implied
  // supporting behavior (loading/empty/error/confirmation states) every
  // screen and workflow needs, so a later generation stage cannot produce
  // something structurally present but behaviorally hollow without it
  // being a recorded, checkable Blueprint violation. See
  // src/lib/generation/interaction-contracts.ts. The original idea text is
  // passed through so real customer-stated states (e.g. "show a loading
  // spinner") are classified `explicit`, not indistinguishable from purely
  // pattern-inferred ones.
  const interactionContracts: InteractionContractMap = {};
  for (const screen of screens) {
    interactionContracts[screen] = inferScreenPatterns(
      screen,
      categories,
      productState.originalIdea,
    );
  }
  for (const workflow of workflows) {
    interactionContracts[workflowContractKey(workflow.name)] = inferWorkflowPatterns(
      categories,
      productState.originalIdea,
    );
  }

  const targetUsersRaw = productDNA?.targetUsers;
  const targetUsers = Array.isArray(targetUsersRaw) ? (targetUsersRaw as string[]) : [];

  const outputTargetsRaw = productState.outputTargets;
  const outputTargets = Array.isArray(outputTargetsRaw) ? (outputTargetsRaw as string[]) : ["web"];

  const assumptions: string[] = [
    "Blueprint generated deterministically from Impact Analysis categories, not real design intelligence.",
    "Screen, workflow, and data-model names are generic placeholders pending customer confirmation.",
  ];
  const openDecisions: string[] = [];
  if (targetUsers.length === 0) {
    openDecisions.push("Confirm the primary target user/customer for this product.");
  }
  if (dataModels.length === 0) {
    openDecisions.push("Confirm the primary data entity this product needs to persist.");
  }
  // Inference Boundaries (D-0022): a consequential_decision-classified
  // interaction state (e.g. payment confirmation) is never silently
  // treated as approved. Recorded here in the same place every other
  // needs-attention item on a Blueprint goes; wiring it into an actual
  // Decision Ledger approval gate belongs to whichever unit first turns
  // this Blueprint into a real build (P2-03/P2-06), not to generation
  // that hasn't been approved yet. An `unresolved` state (P2-EXIT
  // extension) is recorded the same way — an open question this module
  // cannot answer, never silently decided either way.
  for (const [key, contract] of Object.entries(interactionContracts)) {
    for (const state of contract.consequentialStates) {
      openDecisions.push(
        `"${key}" implies a "${state}" step before proceeding — this is a consequential decision and has not been approved.`,
      );
    }
    for (const state of contract.unresolvedStates) {
      openDecisions.push(
        `"${key}" may need a "${state}" step, but this cannot be determined from the idea alone — unresolved, confirm with the customer.`,
      );
    }
  }

  const security = {
    authenticationRequired: true,
    notes: uniq([
      "End users authenticate separately from the Pocket Studio platform account that owns this project.",
      ...permissionNotes,
    ]),
  };

  const memory = memoryEntries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    content: entry.content,
  }));

  const validation = validateBlueprint({
    schemaVersion: "1.0",
    productType: "web_application",
    roles,
    screens,
    outputTargets,
    dataModels,
    requirements,
    workflows,
    interactionContracts,
  });

  const generationMetadata = {
    generatedBy: "deterministic-template-generator-v1",
    generatedAt: new Date().toISOString(),
    method:
      "Derived from Impact Analysis categories over the original idea and Requirements Engine output; not AI-generated design.",
  };

  const blueprint = await createBlueprintVersion(actorUserId, projectId, {
    schemaVersion: "1.0",
    productType: "web_application",
    targetUsers,
    roles,
    requirements: requirements as unknown as Prisma.InputJsonValue,
    workflows,
    screens,
    navigation: { screens, primary: screens[0] },
    dataModels,
    permissions: permissionNotes,
    actions,
    integrations: productState.requiredIntegrations ?? [],
    businessRules,
    monetization: monetizationNotes,
    subscriptions: [],
    ownerOperations: hasPermissionsCategory ? ["Manage records", "View activity"] : [],
    outputTargets,
    themeAndStyle: { style: "default", notes: "No brand direction specified yet." },
    interactionContracts: interactionContracts as unknown as Prisma.InputJsonValue,
    assumptions,
    openDecisions,
    memory,
    security,
    privacy: { notes: productState.governanceRequirements ?? [] },
    accessibility: {
      notes: "Structured component registry used; no dedicated accessibility audit performed yet.",
    },
    governance: productState.governanceRequirements ?? [],
    feasibility: productState.feasibilityReport ?? undefined,
    generationMetadata,
    validationStatus: validation.status,
    validationErrors: validation.errors,
    basedOnProductStateVersion: productState.version,
    basedOnProductDnaVersion: productDNA?.version ?? null,
  });

  for (const screen of screens) {
    await createKnowledgeNode(actorUserId, projectId, { type: "SCREEN", label: screen });
  }
  for (const workflow of workflows) {
    await createKnowledgeNode(actorUserId, projectId, {
      type: "WORKFLOW",
      label: workflow.name,
      data: workflow,
    });
  }
  for (const model of dataModels) {
    await createKnowledgeNode(actorUserId, projectId, {
      type: "DATA_MODEL",
      label: model.name,
      data: model,
    });
  }
  for (const action of actions) {
    await createKnowledgeNode(actorUserId, projectId, { type: "ACTION", label: action });
  }

  await recordEvent(actorUserId, projectId, {
    type: "BLUEPRINT_VERSION_CREATED",
    summary: `Generated Blueprint version ${blueprint.version} (${validation.status}).`,
    data: {
      version: blueprint.version,
      validationStatus: validation.status,
      errorCount: validation.errors.length,
    },
  });

  return blueprint;
}
