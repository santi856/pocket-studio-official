import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestBlueprint } from "./blueprint";
import { getLatestBuildPlan } from "./build-plan";
import { validateInteractionContracts, workflowContractKey } from "./interaction-contracts";
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

function asWorkflowNames(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as Array<{ name?: unknown }>)
        .map((item) => item?.name)
        .filter((name): name is string => typeof name === "string")
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
 * Reuses P2-01's own structural check (every screen and workflow has a
 * declared contract with at least one pattern and one required state) —
 * the Quality Gate does not duplicate that logic, only requires it to
 * pass. Extended (P2-EXIT) to cover workflow subjects too, not just
 * screens — a workflow's contract was previously computed and stored but
 * never structurally re-verified at this gate.
 */
function checkInteractionContractsWellFormed(blueprint: Blueprint): QualityGateCheck {
  const screens = asStringArray(blueprint.screens);
  const workflowNames = asWorkflowNames(blueprint.workflows);
  const subjects = [...screens, ...workflowNames.map((name) => workflowContractKey(name))];
  const contracts = (blueprint.interactionContracts ?? {}) as InteractionContractMap;
  const result = validateInteractionContracts(subjects, contracts);
  return {
    name: "Every screen and workflow has a well-formed Interaction Contract",
    passed: result.valid,
    details: result.valid ? "All screens and workflows covered." : result.violations.join("; "),
  };
}

/**
 * A state this build's Interaction Contract System claims will be
 * implemented (any classification other than `consequential_decision`,
 * which is deliberately disclosed rather than auto-rendered) but flags as
 * `unsupportedStates` (interaction-contracts.ts's own capability check) is
 * a real gap this Quality Gate must catch — never silently pass a
 * generation that promises behavior this renderer cannot build yet.
 */
function checkNoUnsupportedRequiredStates(blueprint: Blueprint): QualityGateCheck {
  const contracts = (blueprint.interactionContracts ?? {}) as InteractionContractMap;
  const problems: string[] = [];
  for (const [subject, contract] of Object.entries(contracts)) {
    if (contract.unsupportedStates?.length > 0) {
      problems.push(
        `"${subject}" requires ${contract.unsupportedStates.join(", ")}, which this build's renderer cannot implement yet.`,
      );
    }
  }
  return {
    name: "Every required interaction state is implementable by this build's renderer",
    passed: problems.length === 0,
    details: problems.length === 0 ? "No unsupported required states." : problems.join("; "),
  };
}

/**
 * Master Spec §4.2 / D-0022: a consequential or unresolved interaction
 * state must be disclosed, never silently decided either way. This
 * re-verifies the disclosure actually happened (blueprint-generator.ts's
 * own openDecisions loop) rather than trusting it structurally — a real
 * regression there (e.g. the loop being accidentally removed in a future
 * change) would otherwise pass every other check silently.
 */
function checkConsequentialAndUnresolvedStatesAreDisclosed(blueprint: Blueprint): QualityGateCheck {
  const contracts = (blueprint.interactionContracts ?? {}) as InteractionContractMap;
  const openDecisions = asStringArray(blueprint.openDecisions);
  const problems: string[] = [];

  for (const [subject, contract] of Object.entries(contracts)) {
    for (const state of contract.consequentialStates ?? []) {
      const disclosed = openDecisions.some(
        (decision) =>
          decision.includes(`"${subject}"`) &&
          decision.includes(`"${state}"`) &&
          decision.includes("consequential decision"),
      );
      if (!disclosed) {
        problems.push(`"${subject}"'s consequential "${state}" state is not disclosed.`);
      }
    }
    for (const state of contract.unresolvedStates ?? []) {
      const disclosed = openDecisions.some(
        (decision) =>
          decision.includes(`"${subject}"`) &&
          decision.includes(`"${state}"`) &&
          decision.includes("unresolved"),
      );
      if (!disclosed) {
        problems.push(`"${subject}"'s unresolved "${state}" state is not disclosed.`);
      }
    }
  }

  return {
    name: "Consequential and unresolved interaction states are disclosed, never silently decided",
    passed: problems.length === 0,
    details:
      problems.length === 0
        ? "All consequential/unresolved states are disclosed."
        : problems.join("; "),
  };
}

/**
 * A `Button` node reachable outside any `Form` ancestor relies entirely on
 * a caller-supplied `onAction` handler (component-renderer.tsx) — the live
 * preview route (P2-06) does not currently pass one, so such a Button
 * would render as a real, clickable, focusable element that silently does
 * nothing on click: exactly "looks interactive but is unwired." Today's
 * deterministic `buildComponentTree` never produces one (every Button sits
 * inside a Form), so this has zero live matches — but it is a real,
 * generic safety net against a future template regression, not dead code:
 * see quality-gate.test.ts for a direct unit test of the detection logic
 * against a synthetic tree.
 */
export function findUnwiredButtonLabels(node: ComponentNode, insideForm = false): string[] {
  const nowInsideForm = insideForm || node.type === "Form";
  const found: string[] = [];
  if (node.type === "Button" && !insideForm) {
    const label = typeof node.props?.label === "string" ? node.props.label : "(unlabeled)";
    found.push(label);
  }
  for (const child of node.children ?? []) {
    found.push(...findUnwiredButtonLabels(child, nowInsideForm));
  }
  return found;
}

function checkNoUnwiredButtons(buildPlan: BuildPlan): QualityGateCheck {
  const componentStructure = (buildPlan.componentStructure ?? {}) as Record<string, ComponentNode>;
  const problems: string[] = [];
  for (const [screen, node] of Object.entries(componentStructure)) {
    const unwired = findUnwiredButtonLabels(node);
    if (unwired.length > 0) {
      problems.push(
        `"${screen}" has Button(s) outside any Form with no real action wired: ${unwired.join(", ")}.`,
      );
    }
  }
  return {
    name: "Every Button is wired to a real action (inside a Form, or a real onAction handler)",
    passed: problems.length === 0,
    details: problems.length === 0 ? "No unwired buttons found." : problems.join("; "),
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
 * P2-EXIT: "quality.gate" alone is one flat status collapsing structural,
 * behavioral, accessibility, governance, and operational completeness
 * into a single pass/fail — a Build Plan with a missing alt tag and one
 * with a genuinely unwired Button both just read "BLOCKED," which hides
 * *what kind* of gap it is. Every check is mapped to exactly one real,
 * distinct dimension; each dimension gets its own Truth Status subjectKey
 * (the same "one subjectKey per real axis" pattern already established
 * for output.web/output.pwa/output.ios/output.android, P2-14/P2-15) in
 * addition to — not instead of — the existing aggregate "quality.gate"
 * rollup, so no existing caller's behavior changes.
 */
export const QUALITY_DIMENSIONS = [
  "structural",
  "behavioral",
  "accessibility",
  "governance",
  "operational",
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

const CHECK_DIMENSIONS: Readonly<Record<string, QualityDimension>> = {
  "Blueprint is structurally valid": "structural",
  "Build Plan has no unresolved blockers": "structural",
  "Every screen and workflow has a well-formed Interaction Contract": "structural",
  "Every required interaction state is implementable by this build's renderer": "behavioral",
  "Consequential and unresolved interaction states are disclosed, never silently decided":
    "governance",
  "Every Button is wired to a real action (inside a Form, or a real onAction handler)":
    "behavioral",
  "List-view screens are wired to a real data dependency": "behavioral",
  "Form-submission screens' Inputs match their bound data model's fields": "behavioral",
  "Every screen is reachable from the navigation graph": "operational",
  "Every Image has alt text": "accessibility",
  "Every screen's data binding resolves without error": "operational",
};

const QUALITY_DIMENSION_LABELS: Readonly<Record<QualityDimension, string>> = {
  structural: "Structural completeness (Blueprint / Build Plan / Interaction Contracts)",
  behavioral: "Behavioral completeness (wired, implementable interactions)",
  accessibility: "Accessibility completeness",
  governance: "Governance disclosure (consequential / unresolved decisions)",
  operational: "Operational completeness (reachability, runtime data binding)",
};

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
    checkNoUnsupportedRequiredStates(blueprint),
    checkConsequentialAndUnresolvedStatesAreDisclosed(blueprint),
    checkNoUnwiredButtons(buildPlan),
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

  const dimensionChecks = new Map<QualityDimension, QualityGateCheck[]>();
  for (const check of checks) {
    const dimension = CHECK_DIMENSIONS[check.name];
    if (!dimension) continue; // never crash on a future check this map hasn't been updated for
    dimensionChecks.set(dimension, [...(dimensionChecks.get(dimension) ?? []), check]);
  }
  for (const [dimension, dimChecks] of dimensionChecks) {
    const dimensionPassed = dimChecks.every((check) => check.passed);
    const dimensionFailedNames = dimChecks.filter((check) => !check.passed).map((c) => c.name);
    await setTruthStatus(actorUserId, projectId, {
      subjectKey: `quality.${dimension}`,
      subjectLabel: QUALITY_DIMENSION_LABELS[dimension],
      status: dimensionPassed ? "IMPLEMENTED" : "BLOCKED",
      rationale: dimensionPassed
        ? `All ${dimChecks.length} ${dimension} check(s) passed.`
        : `Failed: ${dimensionFailedNames.join("; ")}`,
    });
  }

  await recordEvent(actorUserId, projectId, {
    type: "QUALITY_GATE_RUN",
    summary: `Quality Gate ${passed ? "passed" : "failed"} for Blueprint v${blueprint.version}, Build Plan v${buildPlan.version}.`,
    data: { passed, failedChecks: failedNames },
  });

  return { passed, checks };
}
