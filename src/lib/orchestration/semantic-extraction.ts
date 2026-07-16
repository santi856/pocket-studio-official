import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getAIProvider } from "@/lib/ai/get-provider";
import { recordAiUsageEvent } from "@/lib/observability/ai-usage";
import { createSemanticModelVersion } from "@/lib/product/semantic-model";
import { computeExtractionCoverage } from "@/lib/generation/semantic-coverage";
import type { SemanticExtractionResult } from "@/lib/ai/provider";
import type { ProductSemanticModel, Prisma } from "@/generated/prisma/client";

export type SemanticExtractionRunResult = {
  extraction: SemanticExtractionResult;
  semanticModel: ProductSemanticModel;
};

/**
 * The Semantic Product Compiler's entry point (D-0065, execution/
 * architecture/SEMANTIC_PRODUCT_COMPILER_REPORT.md §19 step 5). Calls the
 * configured AIProvider (real Anthropic extraction, or the honest
 * deterministic fallback both providers share), scores the result with the
 * deterministic Semantic Coverage Engine, and persists a new
 * ProductSemanticModel version. Every material item's requirementId is
 * already stable (assigned by the provider via deriveRequirementId) before
 * this function ever sees it, so this function does no ID assignment of
 * its own — only orchestration and persistence.
 */
export async function extractProductSemanticsForProject(
  actorUserId: string,
  projectId: string,
  rawText: string,
  priorRawText: string | null,
  basedOnProductStateVersion: number,
): Promise<SemanticExtractionRunResult> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const provider = getAIProvider();
  const extraction = await provider.extractProductSemantics({ rawText, priorRawText });

  // See provider.ts's SemanticExtractionResult.usage doc comment: non-null
  // usage is the sole signal a real provider call actually succeeded,
  // shared identically by MockAIProvider and AnthropicAIProvider's own
  // internal fallback path.
  const mode: "ai" | "deterministic_fallback" =
    extraction.usage !== null ? "ai" : "deterministic_fallback";

  if (extraction.usage) {
    await recordAiUsageEvent({
      organizationId: project.organizationId,
      provider: provider.name,
      inputTokens: extraction.usage.inputTokens,
      outputTokens: extraction.usage.outputTokens,
    });
  }

  const coverageResult = computeExtractionCoverage(extraction, rawText);

  const generationMetadata = {
    generatedBy: provider.name,
    mode,
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonValue;

  const semanticModel = await createSemanticModelVersion(actorUserId, projectId, {
    schemaVersion: "1.0",
    purpose: extraction.purpose,
    targetUsers: extraction.targetUsers,
    actors: extraction.actors as unknown as Prisma.InputJsonValue,
    entities: extraction.entities as unknown as Prisma.InputJsonValue,
    workflows: extraction.workflows as unknown as Prisma.InputJsonValue,
    capabilities: extraction.capabilities as unknown as Prisma.InputJsonValue,
    permissions: extraction.permissions as unknown as Prisma.InputJsonValue,
    businessRules: extraction.businessRules as unknown as Prisma.InputJsonValue,
    monetization: extraction.monetization as unknown as Prisma.InputJsonValue,
    integrations: extraction.integrations as unknown as Prisma.InputJsonValue,
    constraints: extraction.constraints as unknown as Prisma.InputJsonValue,
    unresolvedQuestions: extraction.unresolvedQuestions,
    consequentialDecisions: extraction.consequentialDecisions,
    unsupportedRequirements: extraction.unsupportedRequirements,
    generationMetadata,
    coverageResult: coverageResult as unknown as Prisma.InputJsonValue,
    basedOnProductStateVersion,
  });

  return { extraction, semanticModel };
}
