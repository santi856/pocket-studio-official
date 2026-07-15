import "server-only";
import type { SemanticExtractionResult, SemanticSourceType } from "@/lib/ai/provider";

/**
 * The Semantic Coverage Engine (D-0065, execution/architecture/
 * SEMANTIC_PRODUCT_COMPILER_REPORT.md §7, §13). Deterministic, no AI call
 * — this is the founder's "Verification Agent" + "Semantic Fidelity
 * Critic" roles collapsed into one reproducible comparator, per the
 * report's §10 decision that deterministic validators remain the final
 * enforcement authority rather than a second AI opinion certifying the
 * first.
 *
 * Two distinct questions, both answered here:
 *  - computeExtractionCoverage: did the extraction itself find anything
 *    for each dimension worth reporting? (stored on
 *    ProductSemanticModel.coverageResult at extraction time)
 *  - computeBlueprintSemanticCoverage: did what was extracted actually
 *    make it into the generated Blueprint? (the deeper check — an item
 *    can be "covered" in the semantic model and still "missing" here if
 *    downstream generation silently dropped it; this is the check that
 *    closes the founder's diagnosed "information existed but was ignored"
 *    failure mode).
 */

export type CoverageStatus =
  "covered" | "partially_covered" | "unresolved" | "unsupported" | "deferred" | "missing";

export type DimensionCoverage = {
  dimension: string;
  status: CoverageStatus;
  itemCount: number;
  explicitItemCount: number;
  providingArtifact: string | null;
  missingItemNames: string[];
  notes: string;
};

export type SemanticCoverageReport = {
  dimensions: DimensionCoverage[];
  /**
   * "materially_incomplete" only when a `customer_explicit` actor, entity,
   * or primary (customer_explicit) workflow is `missing` — deliberately
   * not triggered by low/medium-confidence or recommendation-tier gaps,
   * matching the founder's "do not hard-fail every terse idea" balance
   * (report §13).
   */
  overallStatus: "adequate" | "materially_incomplete";
  missingExplicitActors: string[];
  missingExplicitEntities: string[];
  missingExplicitWorkflows: string[];
};

const EXPLICIT_SOURCE_TYPES: ReadonlySet<SemanticSourceType> = new Set([
  "customer_explicit",
  "customer_confirmed",
]);

function isExplicit(sourceType: SemanticSourceType): boolean {
  return EXPLICIT_SOURCE_TYPES.has(sourceType);
}

// Used only by computeBlueprintSemanticCoverage (not the extraction-time
// per-dimension counts above). Deliberately broader than "explicit" —
// the actual founder-reported failure mode was "the information existed
// (even at low confidence) but was silently ignored downstream," not
// merely "a high-confidence item was ignored." A low_risk_inference item
// (which is what the honest deterministic fallback produces, since it
// never claims customer_explicit certainty) still deserves to reach the
// Blueprint; only a "recommendation" (an unconfirmed suggestion, never a
// reading of the customer's own text) is exempt from this check.
const REPRESENTATION_EXPECTED_SOURCE_TYPES: ReadonlySet<SemanticSourceType> = new Set([
  "customer_explicit",
  "customer_confirmed",
  "low_risk_inference",
]);

function expectsRepresentation(sourceType: SemanticSourceType): boolean {
  return REPRESENTATION_EXPECTED_SOURCE_TYPES.has(sourceType);
}

function dimensionFromCount(
  dimension: string,
  itemCount: number,
  explicitItemCount: number,
  providingArtifact: string | null,
): DimensionCoverage {
  const status: CoverageStatus =
    itemCount === 0 ? "missing" : explicitItemCount > 0 ? "covered" : "partially_covered";
  return {
    dimension,
    status,
    itemCount,
    explicitItemCount,
    providingArtifact,
    missingItemNames: [],
    notes:
      itemCount === 0
        ? `No ${dimension} items were extracted.`
        : `${itemCount} item(s) extracted, ${explicitItemCount} customer-explicit/confirmed.`,
  };
}

/**
 * Coverage of the extraction itself — no Blueprint exists yet at this
 * point in the pipeline (extraction runs before Blueprint generation).
 */
export function computeExtractionCoverage(
  extraction: SemanticExtractionResult,
): SemanticCoverageReport {
  const dimensions: DimensionCoverage[] = [
    dimensionFromCount(
      "purpose",
      extraction.purpose.trim().length > 0 ? 1 : 0,
      extraction.purpose.trim().length > 0 ? 1 : 0,
      "ProductSemanticModel.purpose",
    ),
    dimensionFromCount(
      "targetUsers",
      extraction.targetUsers.length,
      extraction.targetUsers.length,
      "ProductSemanticModel.targetUsers",
    ),
    dimensionFromCount(
      "actors",
      extraction.actors.length,
      extraction.actors.filter((a) => isExplicit(a.provenance.sourceType)).length,
      "ProductSemanticModel.actors",
    ),
    dimensionFromCount(
      "entities",
      extraction.entities.length,
      extraction.entities.filter((e) => isExplicit(e.provenance.sourceType)).length,
      "ProductSemanticModel.entities",
    ),
    dimensionFromCount(
      "workflows",
      extraction.workflows.length,
      extraction.workflows.filter((w) => isExplicit(w.provenance.sourceType)).length,
      "ProductSemanticModel.workflows",
    ),
    dimensionFromCount(
      "capabilities",
      extraction.capabilities.length,
      extraction.capabilities.filter((c) => isExplicit(c.provenance.sourceType)).length,
      "ProductSemanticModel.capabilities",
    ),
    dimensionFromCount(
      "permissions",
      extraction.permissions.length,
      extraction.permissions.filter((p) => isExplicit(p.provenance.sourceType)).length,
      "ProductSemanticModel.permissions",
    ),
    dimensionFromCount(
      "businessRules",
      extraction.businessRules.length,
      extraction.businessRules.filter((b) => isExplicit(b.provenance.sourceType)).length,
      "ProductSemanticModel.businessRules",
    ),
    dimensionFromCount(
      "monetization",
      extraction.monetization.length,
      extraction.monetization.filter((m) => isExplicit(m.provenance.sourceType)).length,
      "ProductSemanticModel.monetization",
    ),
    dimensionFromCount(
      "integrations",
      extraction.integrations.length,
      extraction.integrations.filter((i) => isExplicit(i.provenance.sourceType)).length,
      "ProductSemanticModel.integrations",
    ),
    dimensionFromCount(
      "constraints",
      extraction.constraints.length,
      extraction.constraints.filter((c) => isExplicit(c.provenance.sourceType)).length,
      "ProductSemanticModel.constraints",
    ),
  ];

  // Permissions/monetization/integrations/constraints/businessRules
  // legitimately being empty is not a coverage failure for most real
  // ideas (many products genuinely have none of these) — only
  // actors/entities/workflows/purpose are ever escalated to
  // materially_incomplete, and only when a customer_explicit item is
  // absent, never merely because the count is low.
  return {
    dimensions,
    overallStatus: "adequate",
    missingExplicitActors: [],
    missingExplicitEntities: [],
    missingExplicitWorkflows: [],
  };
}

function normalizeForComparison(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isRepresented(name: string, haystack: readonly string[]): boolean {
  const needle = normalizeForComparison(name);
  if (needle.length === 0) return false;
  return haystack.some((candidate) => {
    const normalizedCandidate = normalizeForComparison(candidate);
    return (
      normalizedCandidate === needle ||
      normalizedCandidate.includes(needle) ||
      needle.includes(normalizedCandidate)
    );
  });
}

export type BlueprintCoverageInputs = {
  roles: readonly string[];
  dataModelNames: readonly string[];
  workflowNames: readonly string[];
  screens: readonly string[];
};

/**
 * The deeper check: did what the semantic model found actually reach the
 * generated Blueprint, or was it silently dropped by the deterministic
 * template layer? Fuzzy (substring, case/punctuation-insensitive) name
 * matching, not exact equality — Blueprint generation is free to rename
 * "Family Members" to "family_member" or similar without that counting as
 * a loss, only a genuinely absent concept counts.
 */
export function computeBlueprintSemanticCoverage(
  extraction: Pick<SemanticExtractionResult, "actors" | "entities" | "workflows">,
  blueprint: BlueprintCoverageInputs,
): SemanticCoverageReport {
  const explicitActors = extraction.actors.filter((a) =>
    expectsRepresentation(a.provenance.sourceType),
  );
  const explicitEntities = extraction.entities.filter((e) =>
    expectsRepresentation(e.provenance.sourceType),
  );
  const explicitWorkflows = extraction.workflows.filter((w) =>
    expectsRepresentation(w.provenance.sourceType),
  );

  const missingExplicitActors = explicitActors
    .filter((a) => !isRepresented(a.name, blueprint.roles))
    .map((a) => a.name);
  const missingExplicitEntities = explicitEntities
    .filter((e) => !isRepresented(e.name, blueprint.dataModelNames))
    .map((e) => e.name);
  const missingExplicitWorkflows = explicitWorkflows
    .filter((w) => !isRepresented(w.name, blueprint.workflowNames))
    .map((w) => w.name);

  const dimensions: DimensionCoverage[] = [
    {
      dimension: "actors",
      status:
        explicitActors.length === 0
          ? "missing"
          : missingExplicitActors.length === 0
            ? "covered"
            : "partially_covered",
      itemCount: extraction.actors.length,
      explicitItemCount: explicitActors.length,
      providingArtifact: "Blueprint.roles",
      missingItemNames: missingExplicitActors,
      notes:
        missingExplicitActors.length > 0
          ? `${missingExplicitActors.length} customer-explicit actor(s) did not reach Blueprint.roles: ${missingExplicitActors.join(", ")}.`
          : "All customer-explicit actors are represented in Blueprint.roles.",
    },
    {
      dimension: "entities",
      status:
        explicitEntities.length === 0
          ? "missing"
          : missingExplicitEntities.length === 0
            ? "covered"
            : "partially_covered",
      itemCount: extraction.entities.length,
      explicitItemCount: explicitEntities.length,
      providingArtifact: "Blueprint.dataModels",
      missingItemNames: missingExplicitEntities,
      notes:
        missingExplicitEntities.length > 0
          ? `${missingExplicitEntities.length} customer-explicit entit(y/ies) did not reach Blueprint.dataModels: ${missingExplicitEntities.join(", ")}.`
          : "All customer-explicit entities are represented in Blueprint.dataModels.",
    },
    {
      dimension: "workflows",
      status:
        explicitWorkflows.length === 0
          ? "missing"
          : missingExplicitWorkflows.length === 0
            ? "covered"
            : "partially_covered",
      itemCount: extraction.workflows.length,
      explicitItemCount: explicitWorkflows.length,
      providingArtifact: "Blueprint.workflows",
      missingItemNames: missingExplicitWorkflows,
      notes:
        missingExplicitWorkflows.length > 0
          ? `${missingExplicitWorkflows.length} customer-explicit workflow(s) did not reach Blueprint.workflows: ${missingExplicitWorkflows.join(", ")}.`
          : "All customer-explicit workflows are represented in Blueprint.workflows.",
    },
  ];

  const overallStatus: SemanticCoverageReport["overallStatus"] =
    missingExplicitActors.length > 0 ||
    missingExplicitEntities.length > 0 ||
    missingExplicitWorkflows.length > 0
      ? "materially_incomplete"
      : "adequate";

  return {
    dimensions,
    overallStatus,
    missingExplicitActors,
    missingExplicitEntities,
    missingExplicitWorkflows,
  };
}
