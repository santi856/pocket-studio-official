import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { createProductStateVersion, getLatestProductState } from "@/lib/product/product-state";
import { updateProductDNA } from "@/lib/product/product-dna";
import { addProductMemoryEntry } from "@/lib/product/product-memory";
import { createKnowledgeNode } from "@/lib/product/product-knowledge";
import { assessFeasibility } from "@/lib/orchestration/feasibility";
import { syncTruthStatusFromFeasibility } from "@/lib/orchestration/truth-status-sync";
import { recordEvent } from "@/lib/product/events";
import {
  deriveOpenQuestions,
  deriveRequirements,
  extractTargetCustomer,
  suggestCapabilityKeys,
} from "@/lib/orchestration/requirements-engine";
import type { DerivedRequirement } from "@/lib/orchestration/requirements-engine";
import {
  deriveBusinessModelBrief,
  deriveMonetizationRecommendations,
} from "@/lib/orchestration/business-intelligence";
import { defaultUnitEconomicsAssumptions } from "@/lib/orchestration/unit-economics";
import type { ProductDNA, ProductState } from "@/generated/prisma/client";
import type { FeasibilityReport } from "@/lib/orchestration/feasibility";

export type ProductIntelligenceResult = {
  productState: ProductState;
  productDNA: ProductDNA;
  requirements: DerivedRequirement[];
  openQuestions: string[];
  feasibilityReport: FeasibilityReport;
};

/**
 * Generates Product Intelligence, a Feasibility Report, a Business Model
 * Brief, monetization recommendations, and unit-economics assumptions for
 * a first-time idea submission (Master Spec §51 steps 6-13, §17, §19-21),
 * then persists everything as a new Canonical Product State version,
 * Product DNA version, Requirement knowledge nodes, and Product Memory
 * entries. Every generated claim is grounded in the deterministic mock
 * provider (Requirements/Business Intelligence derivation) and the
 * Supported Capability Registry (Feasibility) — nothing here is invented
 * beyond what those two sources actually support.
 *
 * ProductState is full-replace versioned (like Blueprint), not
 * carry-forward like ProductDNA — every field this function computes is
 * genuinely re-derived on each call. `unitEconomicsAssumptions` is the one
 * exception: it is the one field a customer can directly edit
 * (updateUnitEconomicsAssumptions), so calling this function again later —
 * e.g. from an applied Change Set (P2-08) — must carry it forward from the
 * latest existing Product State rather than silently resetting it to
 * defaults. Discovered as a real regression while wiring Change Sets: the
 * only prior caller of this function (describe_idea) never had a second
 * call with a prior customer edit to lose.
 */
export async function generateProductIntelligence(
  actorUserId: string,
  projectId: string,
  rawIdea: string,
): Promise<ProductIntelligenceResult> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const previousState = await getLatestProductState(actorUserId, projectId);

  const requirements = deriveRequirements(rawIdea);
  const openQuestions = deriveOpenQuestions(rawIdea, requirements);
  const targetCustomer = extractTargetCustomer(rawIdea);
  const capabilityKeys = suggestCapabilityKeys(requirements);
  const feasibilityReport = await assessFeasibility(capabilityKeys);
  const businessModelBrief = deriveBusinessModelBrief(rawIdea, requirements);
  const monetizationRecommendations = deriveMonetizationRecommendations(requirements);
  const unitEconomicsAssumptions =
    previousState?.unitEconomicsAssumptions ?? defaultUnitEconomicsAssumptions();
  const operationalComplexity = {
    level: businessModelBrief.operationalComplexity,
    supportBurden: businessModelBrief.supportBurden,
    notes: businessModelBrief.businessRisks,
  };

  const productIntelligence = {
    purpose: rawIdea.trim(),
    targetCustomer: targetCustomer ?? "not specified — open question",
    requirements,
    openQuestions,
  };

  const requiredIntegrations = feasibilityReport.assessments
    .filter((assessment) => assessment.category === "monetization")
    .map((assessment) => assessment.capabilityKey);

  const governanceRequirements = feasibilityReport.assessments.filter(
    (assessment) => assessment.category === "governance",
  );

  const productState = await createProductStateVersion(actorUserId, projectId, {
    originalIdea: rawIdea,
    productIntelligence,
    feasibilityReport,
    businessModelBrief,
    monetizationRecommendations,
    unitEconomicsAssumptions,
    operationalComplexity,
    requiredIntegrations,
    outputTargets: ["web"],
    governanceRequirements,
  });

  const productDNA = await updateProductDNA(actorUserId, projectId, {
    originalIdea: rawIdea,
    purpose: rawIdea.trim(),
    targetUsers: targetCustomer ? [targetCustomer] : [],
    openQuestions,
  });

  for (const requirement of requirements) {
    await createKnowledgeNode(actorUserId, projectId, {
      type: "REQUIREMENT",
      label: requirement.statement,
      data: { basis: requirement.basis, category: requirement.category },
    });
  }

  await addProductMemoryEntry(actorUserId, projectId, {
    type: "FACT",
    content: `Original idea: ${rawIdea.trim()}`,
  });

  for (const question of openQuestions) {
    await addProductMemoryEntry(actorUserId, projectId, {
      type: "OPEN_QUESTION",
      content: question,
    });
  }

  await syncTruthStatusFromFeasibility(actorUserId, projectId, feasibilityReport);

  await recordEvent(actorUserId, projectId, {
    type: "PRODUCT_STATE_VERSION_CREATED",
    summary: `Generated Product Intelligence and created Product State version ${productState.version}.`,
    data: { version: productState.version, requirementCount: requirements.length },
  });

  return { productState, productDNA, requirements, openQuestions, feasibilityReport };
}
