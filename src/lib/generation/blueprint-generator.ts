import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestProductState, NoProductStateError } from "@/lib/product/product-state";
import { getLatestProductDNA } from "@/lib/product/product-dna";
import { listProductMemoryEntries } from "@/lib/product/product-memory";
import { createKnowledgeNode } from "@/lib/product/product-knowledge";
import { recordEvent } from "@/lib/product/events";
import { deriveRequirements } from "@/lib/orchestration/requirements-engine";
import { getLatestSemanticModel } from "@/lib/product/semantic-model";
import { computeBlueprintSemanticCoverage } from "./semantic-coverage";
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
import type {
  SemanticActor,
  SemanticCapability,
  SemanticEntity,
  SemanticWorkflow,
} from "@/lib/ai/provider";
import type { Blueprint, Prisma } from "@/generated/prisma/client";

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function uniqByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
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

  // Semantic Product Compiler (D-0065, execution/architecture/
  // SEMANTIC_PRODUCT_COMPILER_REPORT.md) — the domain-agnostic
  // actors/entities/workflows/capabilities the Semantic Coverage Engine
  // will later check actually reached this Blueprint. Optional at read
  // time (older projects predating this repair have no semantic model
  // row), in which case Blueprint generation falls back to exactly its
  // prior, category-only behavior — never a breaking change for existing
  // projects.
  const semanticModel = await getLatestSemanticModel(actorUserId, projectId);
  const semanticActors = (semanticModel?.actors as unknown as SemanticActor[] | null) ?? [];
  const semanticEntities = (semanticModel?.entities as unknown as SemanticEntity[] | null) ?? [];
  const semanticWorkflows =
    (semanticModel?.workflows as unknown as SemanticWorkflow[] | null) ?? [];
  const semanticCapabilities =
    (semanticModel?.capabilities as unknown as SemanticCapability[] | null) ?? [];

  const requirements = deriveRequirements(productState.originalIdea);
  const categories = uniq(requirements.map((requirement) => requirement.category));

  const screens = uniq([
    ...BASE_SCREENS,
    ...categories.flatMap((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.screens ?? []),
  ]);
  const semanticActionNames = uniq(
    semanticCapabilities.filter((c) => c.kind === "action").map((c) => c.name),
  );
  const actions = uniq([
    ...categories.flatMap((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.actions ?? []),
    ...semanticActionNames,
  ]);
  const categoryWorkflows = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.workflow)
    .filter((workflow): workflow is { name: string; steps: string[] } => Boolean(workflow));
  const semanticWorkflowDefs = semanticWorkflows.map((w) => ({
    name: w.name,
    steps:
      w.steps.length > 0 ? w.steps : ["Start", "Provide details", "Review", "Confirm", "Complete"],
  }));
  // Union, not replace: a description can legitimately need both a
  // category-implied workflow (e.g. "monetization" always implies a
  // Checkout workflow) and a semantically-extracted, domain-specific one
  // (e.g. an actor-specific task-assignment workflow) — neither should
  // silently displace the other.
  const workflows = uniqByName([...categoryWorkflows, ...semanticWorkflowDefs]);
  const categoryDataModels = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.dataModel)
    .filter((model): model is { name: string; fields: string[] } => Boolean(model));
  const semanticDataModels = semanticEntities.map((e) => ({
    name: e.name,
    fields:
      e.attributes.length > 0
        ? uniq(["id", ...e.attributes, "createdAt"])
        : ["id", "status", "createdAt"],
  }));
  // Same union principle: a monetization-category "Payment" model and any
  // number of semantically-extracted, product-specific entity models are
  // not in conflict — this is the specific fix for the founder-discovered
  // defect (D-0065), where every domain entity previously collapsed into a
  // single generic "Record" regardless of how many distinct concepts the
  // customer actually described.
  categoryDataModels.push(...semanticDataModels);
  // Home (BASE_SCREENS) is unconditionally a list-view screen
  // (LIST_LIKE_SCREEN_NAMES, interaction-contracts.ts) for every product,
  // since almost every real product's home screen browses some primary
  // entity — but before this fix, a data model only existed when the idea
  // text happened to match the "data" category's narrow keyword set
  // ("database", "record", "field", "schema"...), leaving Home unbound and
  // permanently failing the Quality Gate's data-binding check for ordinary
  // plain-language ideas, including the official §56/§59 demonstration
  // sentence itself (Level 3 review round 3 finding 1). The check that
  // actually matters is a *primary* (non-Payment) model existing —
  // deriveDataDependencies (build-planner.ts) explicitly excludes Payment
  // when picking what Home/Browse bind to, since Payment exists to back
  // Checkout, not a browsable list — so the fallback triggers whenever no
  // primary model was category-matched, not merely when the list is empty
  // (a monetization-only idea matches a Payment model but still has no
  // primary model to fall back on). Defaulting to the same generic
  // "Record" model the "data" category template already uses closes that
  // gap without inventing new architecture — GeneratedRecord storage is
  // already keyed generically by model name.
  const dedupedDataModels = uniqByName(categoryDataModels);
  const hasPrimaryDataModel = dedupedDataModels.some((model) => model.name !== "Payment");
  const dataModels = hasPrimaryDataModel
    ? dedupedDataModels
    : [...dedupedDataModels, { name: "Record", fields: ["id", "status", "createdAt"] }];
  const businessRules = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.businessRule)
    .filter((rule): rule is string => Boolean(rule));
  const permissionNotes = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.permission)
    .filter((note): note is string => Boolean(note));
  const monetizationNotes = categories
    .map((category) => BLUEPRINT_CATEGORY_TEMPLATES[category]?.monetization)
    .filter((note): note is string => Boolean(note));

  // A description with 2+ distinct actors carries the same "this product
  // needs role separation" signal as the permissions category's keyword
  // match — either is sufficient, and unlike the keyword match, this one
  // does not depend on the customer having used the literal word "role."
  // This is the specific fix for the founder-discovered defect (D-0065):
  // a description naming multiple distinct actors by name previously
  // still produced roles:["customer"] only whenever "role"/"permission"/
  // "access control" never appeared verbatim in the text.
  const semanticRoleNames = uniq(semanticActors.map((a) => a.name));
  const hasPermissionsCategory = categories.includes("permissions");
  const hasMultipleRoles = hasPermissionsCategory || semanticRoleNames.length >= 2;
  const roles =
    semanticRoleNames.length > 0
      ? uniq([...semanticRoleNames, ...(hasPermissionsCategory ? [OWNER_ROLE] : [])])
      : hasPermissionsCategory
        ? [CUSTOMER_ROLE, OWNER_ROLE]
        : [CUSTOMER_ROLE];

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
  if (!hasPrimaryDataModel) {
    openDecisions.push(
      'No data category was detected from the idea text, so a generic "Record" data entity was assumed as the primary thing this product persists — confirm or rename it.',
    );
  }

  // Semantic Coverage Engine (D-0065): did every actor/entity/workflow the
  // Semantic Product Compiler found actually reach this Blueprint's
  // roles/dataModels/workflows arrays, or was something identified but
  // then silently dropped? Never silently decided either way — every gap
  // becomes a disclosed open decision, the same pattern already used for
  // consequential/unresolved interaction states below.
  const semanticCoverage = computeBlueprintSemanticCoverage(
    { actors: semanticActors, entities: semanticEntities, workflows: semanticWorkflows },
    {
      roles,
      dataModelNames: dataModels.map((m) => m.name),
      workflowNames: workflows.map((w) => w.name),
      screens,
    },
  );
  for (const missing of semanticCoverage.missingExplicitActors) {
    openDecisions.push(
      `The described actor "${missing}" was identified but is not yet represented as a Blueprint role — confirm or rename it.`,
    );
  }
  for (const missing of semanticCoverage.missingExplicitEntities) {
    openDecisions.push(
      `The described entity "${missing}" was identified but is not yet represented as a Blueprint data model — confirm or rename it.`,
    );
  }
  for (const missing of semanticCoverage.missingExplicitWorkflows) {
    openDecisions.push(
      `The described workflow "${missing}" was identified but is not yet represented in the Blueprint — confirm or rename it.`,
    );
  }

  const lowConfidenceSemanticItemCount = [
    ...semanticActors,
    ...semanticEntities,
    ...semanticWorkflows,
  ].filter((item) => item.provenance.confidence === "low").length;
  if (semanticActors.length > 0 || semanticEntities.length > 0 || semanticWorkflows.length > 0) {
    assumptions.push(
      `Semantic extraction identified ${semanticActors.length} actor(s), ${semanticEntities.length} entit${semanticEntities.length === 1 ? "y" : "ies"}, and ${semanticWorkflows.length} workflow(s) from the description` +
        (lowConfidenceSemanticItemCount > 0
          ? ` — ${lowConfidenceSemanticItemCount} item(s) are low-confidence (deterministic-fallback mode) and should be confirmed, not treated as certain.`
          : "."),
    );
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
      "Derived from Impact Analysis categories over the original idea and Requirements Engine output, unioned with the Semantic Product Compiler's structured extraction when available; not AI-generated design at the Blueprint-assembly layer itself (the semantic extraction upstream of it may be AI-backed — see basedOnSemanticModelVersion/semanticExtractionMode).",
    basedOnSemanticModelVersion: semanticModel?.version ?? null,
    semanticExtractionMode:
      (semanticModel?.generationMetadata as { mode?: string } | null)?.mode ?? null,
    semanticCoverage,
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
    ownerOperations: hasMultipleRoles ? ["Manage records", "View activity"] : [],
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
