import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestBlueprint } from "./blueprint";
import { getLatestBuildPlan } from "./build-plan";
import { validateInteractionContracts } from "./interaction-contracts";
import { loadScreenData } from "./render-runtime";
import { bindScreenData } from "./screen-data-binding";
import { recordEvidence } from "@/lib/product/evidence";
import { setTruthStatus } from "@/lib/product/truth-status";
import { recordEvent } from "@/lib/product/events";
import type { ComponentNode } from "./component-registry";
import type { InteractionContractMap } from "./interaction-contracts";
import type { Blueprint, BuildPlan } from "@/generated/prisma/client";

export class NoGenerationToCheckError extends Error {
  constructor() {
    super("This project has no Blueprint and Build Plan yet — nothing to check.");
    this.name = "NoGenerationToCheckError";
  }
}

export type QualityGateCheck = {
  name: string;
  passed: boolean;
  details: string;
};

export type QualityGateResult = {
  passed: boolean;
  checks: QualityGateCheck[];
};

type BlueprintDataModel = { name: string; fields: string[] };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asDataModels(value: unknown): BlueprintDataModel[] {
  return Array.isArray(value)
    ? (value as BlueprintDataModel[]).filter(
        (item) => typeof item?.name === "string" && Array.isArray(item?.fields),
      )
    : [];
}

function findInputNames(node: ComponentNode, names: string[]): void {
  if (node.type === "Input" && typeof node.props?.name === "string") {
    names.push(node.props.name);
  }
  for (const child of node.children ?? []) {
    findInputNames(child, names);
  }
}

function containsType(node: ComponentNode, type: string): boolean {
  if (node.type === type) return true;
  return (node.children ?? []).some((child) => containsType(child, type));
}

/**
 * Master Spec §23/§26: a Blueprint that failed structural validation is
 * not "clean" regardless of what else it contains.
 */
function checkBlueprintValid(blueprint: Blueprint): QualityGateCheck {
  return {
    name: "Blueprint is structurally valid",
    passed: blueprint.validationStatus === "VALID",
    details:
      blueprint.validationStatus === "VALID"
        ? "No validation errors."
        : `Validation errors: ${asStringArray(blueprint.validationErrors).join("; ")}`,
  };
}

/** Master Spec §24: an unresolved blocker means the plan is not ready. */
function checkBuildPlanReady(buildPlan: BuildPlan): QualityGateCheck {
  const blockers = asStringArray(buildPlan.blockers);
  return {
    name: "Build Plan has no unresolved blockers",
    passed: buildPlan.planStatus === "READY" && blockers.length === 0,
    details: blockers.length === 0 ? "No blockers." : `Blockers: ${blockers.join("; ")}`,
  };
}

/**
 * Reuses P2-01's own structural check (every screen has a declared
 * contract with at least one pattern and one required state) — the
 * Quality Gate does not duplicate that logic, only requires it to pass.
 */
function checkInteractionContractsWellFormed(blueprint: Blueprint): QualityGateCheck {
  const screens = asStringArray(blueprint.screens);
  const contracts = (blueprint.interactionContracts ?? {}) as InteractionContractMap;
  const result = validateInteractionContracts(screens, contracts);
  return {
    name: "Every screen has a well-formed Interaction Contract",
    passed: result.valid,
    details: result.valid ? "All screens covered." : result.violations.join("; "),
  };
}

/**
 * The runtime half of P2-05's data binding only swaps a screen's `List`
 * node for its real Loading/Empty/Error state at render time
 * (screen-data-binding.ts) — it is never present in the Build Plan's
 * static `componentStructure`. What the Quality Gate can and should check
 * structurally is the *precondition* for that binding to work: a
 * `list-view` screen's tree actually contains a `List` node, and the
 * screen has a real data dependency configured for `loadScreenData` to
 * resolve — not that the binding ran (a separate runtime check, below).
 */
function checkListViewScreensAreDataBound(
  blueprint: Blueprint,
  buildPlan: BuildPlan,
): QualityGateCheck {
  const contracts = (blueprint.interactionContracts ?? {}) as InteractionContractMap;
  const componentStructure = (buildPlan.componentStructure ?? {}) as Record<string, ComponentNode>;
  const dataDependencies = (buildPlan.dataDependencies ?? {}) as Record<string, string[]>;

  const problems: string[] = [];
  for (const [screen, contract] of Object.entries(contracts)) {
    if (!contract.patterns.includes("list-view")) continue;
    const node = componentStructure[screen];
    if (!node || !containsType(node, "List")) {
      problems.push(`"${screen}" has a list-view pattern but no List node in its component tree.`);
      continue;
    }
    if ((dataDependencies[screen]?.length ?? 0) === 0) {
      problems.push(`"${screen}" has a list-view pattern but no data dependency configured.`);
    }
  }

  return {
    name: "List-view screens are wired to a real data dependency",
    passed: problems.length === 0,
    details: problems.length === 0 ? "All list-view screens are data-bound." : problems.join("; "),
  };
}

/**
 * Closes the P2-06/P2-07 disclosed gap as an ongoing, checkable gate
 * rather than a one-time fix: a form-submission screen's Input names must
 * actually match the bound data model's real fields, or a genuine
 * submission will fail `InvalidRecordDataError` (handled gracefully, but
 * still a real defect the Quality Gate should catch before that point).
 */
function checkFormScreensMatchDataModelFields(
  blueprint: Blueprint,
  buildPlan: BuildPlan,
): QualityGateCheck {
  const contracts = (blueprint.interactionContracts ?? {}) as InteractionContractMap;
  const componentStructure = (buildPlan.componentStructure ?? {}) as Record<string, ComponentNode>;
  const dataDependencies = (buildPlan.dataDependencies ?? {}) as Record<string, string[]>;
  const dataModels = asDataModels(blueprint.dataModels);

  const problems: string[] = [];
  for (const [screen, contract] of Object.entries(contracts)) {
    if (!contract.patterns.includes("form-submission")) continue;
    const node = componentStructure[screen];
    if (!node || !containsType(node, "Form")) {
      problems.push(
        `"${screen}" has a form-submission pattern but no Form node in its component tree.`,
      );
      continue;
    }
    const modelKey = dataDependencies[screen]?.[0];
    if (!modelKey) continue; // no data model bound — nothing to match against.
    const dataModel = dataModels.find((model) => model.name === modelKey);
    if (!dataModel) continue;

    const inputNames: string[] = [];
    findInputNames(node, inputNames);
    const mismatched = inputNames.filter((name) => !dataModel.fields.includes(name));
    if (mismatched.length > 0) {
      problems.push(
        `"${screen}"'s Form has Input(s) named ${mismatched.join(", ")}, not present in "${modelKey}"'s fields (${dataModel.fields.join(", ")}).`,
      );
    }
  }

  return {
    name: "Form-submission screens' Inputs match their bound data model's fields",
    passed: problems.length === 0,
    details:
      problems.length === 0 ? "All form Inputs match their data model." : problems.join("; "),
  };
}

/** Every screen a Build Plan produces must actually be reachable. */
function checkAllScreensReachable(buildPlan: BuildPlan): QualityGateCheck {
  const screenOrder = asStringArray(buildPlan.screenOrder);
  const navigationGraph = Array.isArray(buildPlan.navigationGraph)
    ? (buildPlan.navigationGraph as Array<{ from: string; to: string }>)
    : [];
  const reachable = new Set(navigationGraph.map((edge) => edge.to));
  const primary = screenOrder[0];
  const unreachable = screenOrder.filter((screen) => screen !== primary && !reachable.has(screen));

  return {
    name: "Every screen is reachable from the navigation graph",
    passed: unreachable.length === 0,
    details:
      unreachable.length === 0
        ? "All screens reachable."
        : `Unreachable screens: ${unreachable.join(", ")}.`,
  };
}

function collectImageNodes(node: ComponentNode, images: ComponentNode[]): void {
  if (node.type === "Image") images.push(node);
  for (const child of node.children ?? []) collectImageNodes(child, images);
}

/** Master Spec §55 "accessibility" testing dimension — a real, if minimal, structural check. */
function checkImagesHaveAltText(buildPlan: BuildPlan): QualityGateCheck {
  const componentStructure = (buildPlan.componentStructure ?? {}) as Record<string, ComponentNode>;
  const problems: string[] = [];
  for (const [screen, node] of Object.entries(componentStructure)) {
    const images: ComponentNode[] = [];
    collectImageNodes(node, images);
    const missingAlt = images.filter((image) => !image.props?.alt);
    if (missingAlt.length > 0) {
      problems.push(`"${screen}" has ${missingAlt.length} Image node(s) with no alt text.`);
    }
  }

  return {
    name: "Every Image has alt text",
    passed: problems.length === 0,
    details: problems.length === 0 ? "All images have alt text." : problems.join("; "),
  };
}

/**
 * Master Spec §55's "end-to-end" testing dimension, honestly scoped: a
 * real server-side smoke check that every screen's data binding
 * (render-runtime.ts + screen-data-binding.ts, P2-05) actually resolves
 * without throwing for *this* project's real data — not a full browser
 * e2e run per generation, which this build does not attempt (the
 * generation mechanism itself is covered generically by this codebase's
 * own Playwright suite).
 */
async function checkScreensRenderWithoutError(
  actorUserId: string,
  projectId: string,
  blueprint: Blueprint,
  buildPlan: BuildPlan,
): Promise<QualityGateCheck> {
  const componentStructure = (buildPlan.componentStructure ?? {}) as Record<string, ComponentNode>;
  const dataDependencies = (buildPlan.dataDependencies ?? {}) as Record<string, string[]>;
  const problems: string[] = [];

  for (const [screen, node] of Object.entries(componentStructure)) {
    try {
      const hasDataDependency = (dataDependencies[screen]?.length ?? 0) > 0;
      if (hasDataDependency) {
        const dataState = await loadScreenData(actorUserId, projectId, screen);
        bindScreenData(node, dataState);
      }
    } catch (error) {
      problems.push(
        `"${screen}" failed to resolve: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    name: "Every screen's data binding resolves without error",
    passed: problems.length === 0,
    details: problems.length === 0 ? "All screens resolved cleanly." : problems.join("; "),
  };
}

/**
 * Master Spec §55/§59's Quality Gate: runs every check above against a
 * project's *current* generation (its latest Blueprint and Build Plan),
 * records the result as real Product Evidence and Truth Status — never a
 * self-report — and returns the full breakdown.
 */
export async function runQualityGate(
  actorUserId: string,
  projectId: string,
): Promise<QualityGateResult> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [blueprint, buildPlan] = await Promise.all([
    getLatestBlueprint(actorUserId, projectId),
    getLatestBuildPlan(actorUserId, projectId),
  ]);
  if (!blueprint || !buildPlan) {
    throw new NoGenerationToCheckError();
  }

  const checks: QualityGateCheck[] = [
    checkBlueprintValid(blueprint),
    checkBuildPlanReady(buildPlan),
    checkInteractionContractsWellFormed(blueprint),
    checkListViewScreensAreDataBound(blueprint, buildPlan),
    checkFormScreensMatchDataModelFields(blueprint, buildPlan),
    checkAllScreensReachable(buildPlan),
    checkImagesHaveAltText(buildPlan),
    await checkScreensRenderWithoutError(actorUserId, projectId, blueprint, buildPlan),
  ];

  const passed = checks.every((check) => check.passed);
  const failedNames = checks.filter((check) => !check.passed).map((check) => check.name);

  await recordEvidence(actorUserId, projectId, {
    evidenceType: "QUALITY_GATE_CHECK",
    subjectKey: "quality.gate",
    verificationMethod: checks.map((check) => check.name).join("; "),
    result: passed
      ? `pass — Blueprint v${blueprint.version}, Build Plan v${buildPlan.version}`
      : `fail — ${failedNames.join("; ")}`,
    limitations:
      "Structural and server-side checks only — no real browser e2e run and no live authorization/tenant fuzzing per generation; tenant isolation is structurally guaranteed by the generated-app data layer's own query scoping (P2-04), not re-tested here.",
  });

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "quality.gate",
    subjectLabel: "Quality Gate for the generated product",
    status: passed ? "IMPLEMENTED" : "BLOCKED",
    rationale: passed ? "All Quality Gate checks passed." : `Failed: ${failedNames.join("; ")}`,
  });

  await recordEvent(actorUserId, projectId, {
    type: "QUALITY_GATE_RUN",
    summary: `Quality Gate ${passed ? "passed" : "failed"} for Blueprint v${blueprint.version}, Build Plan v${buildPlan.version}.`,
    data: { passed, failedChecks: failedNames },
  });

  return { passed, checks };
}
