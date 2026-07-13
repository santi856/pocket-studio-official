import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestBlueprint } from "./blueprint";
import { createBuildPlanVersion } from "./build-plan";
import { recordEvent } from "@/lib/product/events";
import {
  CHECKOUT_SCREEN_NAME,
  LIST_LIKE_SCREEN_NAMES,
  workflowContractKey,
  type InteractionContract,
  type InteractionContractMap,
} from "./interaction-contracts";
import {
  validateComponentTree,
  type ComponentNode,
  type RawComponentNode,
} from "./component-registry";
import type { DerivedRequirement } from "@/lib/orchestration/requirements-engine";
import type { FeasibilityReport } from "@/lib/orchestration/feasibility";
import type {
  BuildPlan,
  BuildPlanStatus,
  CapabilityImplementationLevel,
  CapabilityRiskClass,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export class NoBlueprintError extends Error {
  constructor() {
    super("This project has no Blueprint yet — generate one first.");
    this.name = "NoBlueprintError";
  }
}

type BlueprintWorkflow = { name: string; steps: string[] };
type BlueprintDataModel = { name: string; fields: string[] };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asWorkflows(value: unknown): BlueprintWorkflow[] {
  return Array.isArray(value)
    ? (value as BlueprintWorkflow[]).filter(
        (item) => typeof item?.name === "string" && Array.isArray(item?.steps),
      )
    : [];
}

function asDataModels(value: unknown): BlueprintDataModel[] {
  return Array.isArray(value)
    ? (value as BlueprintDataModel[]).filter(
        (item) => typeof item?.name === "string" && Array.isArray(item?.fields),
      )
    : [];
}

function asRequirements(value: unknown): DerivedRequirement[] {
  return Array.isArray(value) ? (value as DerivedRequirement[]) : [];
}

// Fields a record's own lifecycle already manages — never surfaced as a
// user-editable Input, since GeneratedRecord's own id/createdAt come from
// the database, not from customer input.
const SYSTEM_MANAGED_FIELDS: ReadonlySet<string> = new Set(["id", "createdAt"]);

/**
 * Builds a default component tree for a screen from its interaction
 * contract's recognized patterns, using only Component Registry (P2-02)
 * primitives, then runs it through `validateComponentTree` so an
 * unrecognized type — should one ever slip in — fails safely rather than
 * corrupting the plan. When the screen has a `form-submission` pattern and
 * a bound data model, one Input is generated per non-system-managed field,
 * named after that field, so a real submission through the Structured
 * Renderer (P2-05) collects data `createGeneratedRecord` can actually
 * accept — closing the placeholder-Form gap disclosed as a known
 * limitation of P2-06. Deliberately still minimal: real layout/validation
 * beyond field presence is a rendering concern for P2-05, not this
 * planning step.
 */
function buildComponentTree(
  screenName: string,
  contract: InteractionContract | undefined,
  boundDataModel: BlueprintDataModel | undefined,
): ComponentNode {
  const children: RawComponentNode[] = [{ type: "Heading", props: { text: screenName } }];
  const patterns = contract?.patterns ?? [];

  if (patterns.includes("list-view")) {
    children.push({ type: "List", props: {} });
  }
  if (patterns.includes("form-submission")) {
    const editableFields =
      boundDataModel?.fields.filter((field) => !SYSTEM_MANAGED_FIELDS.has(field)) ?? [];
    const inputs: RawComponentNode[] =
      editableFields.length > 0
        ? editableFields.map((field) => ({ type: "Input", props: { name: field } }))
        : [{ type: "Input", props: {} }];
    children.push({
      type: "Form",
      props: {},
      children: [...inputs, { type: "Button", props: { label: "Submit" } }],
    });
  }
  if (
    patterns.includes("detail-view") &&
    !patterns.includes("list-view") &&
    !patterns.includes("form-submission")
  ) {
    children.push({ type: "Card", props: {} });
  }

  const { tree } = validateComponentTree(
    { type: "Screen", props: { name: screenName }, children },
    screenName,
  );
  return tree;
}

function deriveDataDependencies(
  screens: string[],
  dataModels: BlueprintDataModel[],
): Record<string, string[]> {
  const primaryModel = dataModels.find((model) => model.name !== "Payment")?.name;
  const paymentModel = dataModels.find((model) => model.name === "Payment")?.name;

  const result: Record<string, string[]> = {};
  for (const screen of screens) {
    const deps: string[] = [];
    if (LIST_LIKE_SCREEN_NAMES.has(screen) && primaryModel) {
      deps.push(primaryModel);
    }
    if (screen === CHECKOUT_SCREEN_NAME && paymentModel) {
      deps.push(paymentModel);
    }
    result[screen] = deps;
  }
  return result;
}

type ImplementationPhase = { name: string; items: string[] };

function deriveImplementationPhases(input: {
  screens: string[];
  workflows: BlueprintWorkflow[];
  dataModels: BlueprintDataModel[];
  integrations: string[];
  monetization: string[];
}): ImplementationPhase[] {
  const phases: ImplementationPhase[] = [];

  if (input.dataModels.length > 0) {
    phases.push({ name: "Data layer", items: input.dataModels.map((model) => model.name) });
  }
  phases.push({ name: "Screens & navigation", items: input.screens });
  if (input.workflows.length > 0) {
    phases.push({ name: "Workflows & business logic", items: input.workflows.map((w) => w.name) });
  }
  if (input.integrations.length > 0 || input.monetization.length > 0) {
    phases.push({
      name: "Integrations & monetization",
      items: [...input.integrations, ...input.monetization],
    });
  }
  phases.push({
    name: "Testing & evidence",
    items: ["Automated tests", "Evidence records", "Truth Status sync"],
  });

  return phases;
}

function deriveDependencies(phases: ImplementationPhase[]): Record<string, string[]> {
  const dependencies: Record<string, string[]> = {};
  phases.forEach((phase, index) => {
    dependencies[phase.name] = index === 0 ? [] : [phases[index - 1]!.name];
  });
  return dependencies;
}

/**
 * Every workflow gets a real per-state test derived from its own
 * interaction contract (P2-EXIT fix) — previously only a single generic
 * "end-to-end workflow completion test" string, which never reflected
 * that workflow's real required/recommended/consequential states even
 * though `inferWorkflowPatterns` computed them at Blueprint generation
 * time. A workflow's contract was stored but never consumed anywhere in
 * the pipeline until this fix.
 */
function deriveTests(
  screens: string[],
  workflows: BlueprintWorkflow[],
  interactionContracts: InteractionContractMap,
): string[] {
  const tests: string[] = [];
  for (const screen of screens) {
    for (const state of interactionContracts[screen]?.requiredStates ?? []) {
      tests.push(`${screen}: verify the "${state}" state.`);
    }
  }
  for (const workflow of workflows) {
    tests.push(`${workflow.name}: end-to-end workflow completion test.`);
    for (const state of interactionContracts[workflowContractKey(workflow.name)]?.requiredStates ??
      []) {
      tests.push(`${workflow.name}: verify the "${state}" state.`);
    }
  }
  return tests;
}

function deriveAcceptanceCriteria(requirements: DerivedRequirement[]): string[] {
  return requirements.map((requirement) => `Satisfies: ${requirement.statement}`);
}

function deriveEvidenceRequirements(feasibility: FeasibilityReport | null): string[] {
  if (!feasibility || feasibility.assessments.length === 0) {
    return [
      "No Feasibility Report available on this Blueprint — evidence requirements cannot be determined.",
    ];
  }
  return feasibility.assessments.map(
    (assessment) =>
      `${assessment.label}: requires a ${
        assessment.implementationLevel === "SUPPORTED_NOW"
          ? "STRUCTURED_MANUAL_VERIFICATION"
          : "REQUIREMENT_DERIVATION"
      } evidence record before Truth Status may report IMPLEMENTED.`,
  );
}

const RISK_ORDER: readonly CapabilityRiskClass[] = ["LOW", "MEDIUM", "HIGH"];

function deriveRisk(
  feasibility: FeasibilityReport | null,
  consequentialCount: number,
): { level: CapabilityRiskClass; notes: string[] } {
  const notes: string[] = [];
  let level: CapabilityRiskClass = "LOW";

  for (const assessment of feasibility?.assessments ?? []) {
    if (RISK_ORDER.indexOf(assessment.riskClass) > RISK_ORDER.indexOf(level)) {
      level = assessment.riskClass;
    }
    if (assessment.implementationLevel !== "SUPPORTED_NOW") {
      notes.push(
        `Capability "${assessment.capabilityKey}" is currently ${assessment.implementationLevel} — see Truth Status.`,
      );
    }
  }
  if (consequentialCount > 0) {
    notes.push(
      `${consequentialCount} unresolved consequential interaction state(s) pending approval.`,
    );
  }

  return { level, notes };
}

const BLOCKING_LEVELS: ReadonlySet<CapabilityImplementationLevel> = new Set([
  "NOT_CURRENTLY_SUPPORTED",
  "UNSAFE_OR_PROHIBITED",
  "INSUFFICIENT_INFORMATION",
  "PROFESSIONAL_REVIEW_REQUIRED",
  "EXTERNAL_APPROVAL_REQUIRED",
]);

function computeBlockers(
  blueprintValidationStatus: string,
  blueprintValidationErrors: string[],
  openDecisions: string[],
  feasibility: FeasibilityReport | null,
): string[] {
  const blockers: string[] = [];

  if (blueprintValidationStatus === "INVALID") {
    for (const error of blueprintValidationErrors) {
      blockers.push(`Blueprint is INVALID: ${error}`);
    }
  }

  if (!feasibility) {
    blockers.push("No Feasibility Report available on this Blueprint.");
  } else {
    for (const key of feasibility.unrecognizedCapabilityKeys) {
      blockers.push(`Requested capability "${key}" has no Supported Capability Registry entry.`);
    }
    for (const assessment of feasibility.assessments) {
      if (BLOCKING_LEVELS.has(assessment.implementationLevel)) {
        blockers.push(
          `Capability "${assessment.capabilityKey}" is ${assessment.implementationLevel} and must be resolved before this plan can proceed.`,
        );
      }
    }
  }

  for (const decision of openDecisions) {
    if (decision.includes("consequential decision")) {
      blockers.push(`Unresolved consequential decision: ${decision}`);
    }
  }

  return blockers;
}

/**
 * Deterministically derives a Build Plan (Master Spec §24) structurally
 * from a project's latest Blueprint — implementation phases, dependencies,
 * screen order, component structure, navigation graph, data dependencies,
 * backend/business logic, administrative requirements, integrations,
 * monetization, platform requirements, persistence, tests, acceptance
 * criteria, evidence requirements, risk, and blockers. Every field is
 * grounded in the Blueprint's own content or its Feasibility Report; no
 * field is invented. `planStatus` is `BLOCKED` whenever the Blueprint is
 * INVALID, requests an unrecognized/unsafe/unresolved capability, or has an
 * unresolved consequential interaction decision — never silently treated as
 * ready.
 */
export async function generateBuildPlan(
  actorUserId: string,
  projectId: string,
): Promise<BuildPlan> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const blueprint = await getLatestBlueprint(actorUserId, projectId);
  if (!blueprint) {
    throw new NoBlueprintError();
  }

  const screens = asStringArray(blueprint.screens);
  const workflows = asWorkflows(blueprint.workflows);
  const dataModels = asDataModels(blueprint.dataModels);
  const requirements = asRequirements(blueprint.requirements);
  const integrations = asStringArray(blueprint.integrations);
  const monetization = asStringArray(blueprint.monetization);
  const openDecisions = asStringArray(blueprint.openDecisions);
  const interactionContracts = (blueprint.interactionContracts ?? {}) as InteractionContractMap;
  const navigation = blueprint.navigation as { screens?: string[]; primary?: string } | null;
  const primary = navigation?.primary ?? screens[0];
  const feasibility = (blueprint.feasibility ?? null) as FeasibilityReport | null;

  const dataDependencies = deriveDataDependencies(screens, dataModels);
  const componentStructure = Object.fromEntries(
    screens.map((screen) => {
      const boundModelKey = dataDependencies[screen]?.[0];
      const boundDataModel = dataModels.find((model) => model.name === boundModelKey);
      return [screen, buildComponentTree(screen, interactionContracts[screen], boundDataModel)];
    }),
  );
  const navigationGraph = primary
    ? screens
        .filter((screen) => screen !== primary)
        .map((screen) => ({ from: primary, to: screen }))
    : [];
  const phases = deriveImplementationPhases({
    screens,
    workflows,
    dataModels,
    integrations,
    monetization,
  });
  const dependencies = deriveDependencies(phases);
  const tests = deriveTests(screens, workflows, interactionContracts);
  const acceptanceCriteria = deriveAcceptanceCriteria(requirements);
  const evidenceRequirements = deriveEvidenceRequirements(feasibility);
  const consequentialCount = openDecisions.filter((decision) =>
    decision.includes("consequential decision"),
  ).length;
  const risk = deriveRisk(feasibility, consequentialCount);
  const blockers = computeBlockers(
    blueprint.validationStatus,
    asStringArray(blueprint.validationErrors),
    openDecisions,
    feasibility,
  );
  const planStatus: BuildPlanStatus = blockers.length === 0 ? "READY" : "BLOCKED";

  const generationMetadata = {
    generatedBy: "deterministic-build-planner-v1",
    generatedAt: new Date().toISOString(),
    method:
      "Derived structurally from the latest Blueprint version and its Feasibility Report; not AI-generated planning.",
  };

  const plan = await createBuildPlanVersion(actorUserId, projectId, {
    basedOnBlueprintVersion: blueprint.version,
    planStatus,
    implementationPhases: phases as unknown as Prisma.InputJsonValue,
    dependencies: dependencies as unknown as Prisma.InputJsonValue,
    screenOrder: screens,
    componentStructure: componentStructure as unknown as Prisma.InputJsonValue,
    navigationGraph: navigationGraph as unknown as Prisma.InputJsonValue,
    dataDependencies: dataDependencies as unknown as Prisma.InputJsonValue,
    backendAndBusinessLogic: {
      businessRules: blueprint.businessRules ?? [],
      actions: blueprint.actions ?? [],
    } as unknown as Prisma.InputJsonValue,
    administrativeRequirements: (blueprint.ownerOperations ??
      []) as unknown as Prisma.InputJsonValue,
    integrations: integrations as unknown as Prisma.InputJsonValue,
    monetization: monetization as unknown as Prisma.InputJsonValue,
    platformRequirements: (blueprint.outputTargets ?? []) as unknown as Prisma.InputJsonValue,
    persistence: dataModels.map((model) => ({
      modelKey: model.name,
      fields: model.fields,
      storage: "planned: generic multi-tenant store (P2-04)",
    })) as unknown as Prisma.InputJsonValue,
    tests: tests as unknown as Prisma.InputJsonValue,
    acceptanceCriteria: acceptanceCriteria as unknown as Prisma.InputJsonValue,
    evidenceRequirements: evidenceRequirements as unknown as Prisma.InputJsonValue,
    risk: risk as unknown as Prisma.InputJsonValue,
    blockers: blockers as unknown as Prisma.InputJsonValue,
    generationMetadata,
  });

  await recordEvent(actorUserId, projectId, {
    type: "BUILD_PLAN_VERSION_CREATED",
    summary: `Generated Build Plan version ${plan.version} (${planStatus}).`,
    data: {
      version: plan.version,
      planStatus,
      blockerCount: blockers.length,
      basedOnBlueprintVersion: blueprint.version,
    },
  });

  return plan;
}
