import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestBlueprint } from "@/lib/generation/blueprint";
import { getLatestProductState } from "@/lib/product/product-state";
import { getLatestProductDNA } from "@/lib/product/product-dna";
import { upsertGovernanceProfile } from "@/lib/product/governance-profile";
import { createPolicyDocumentDraft } from "@/lib/product/policy-documents";
import { recordDecision } from "@/lib/product/decisions";
import { addProductMemoryEntry } from "@/lib/product/product-memory";
import type {
  Blueprint,
  Decision,
  GovernanceProfile,
  PolicyDocument,
} from "@/generated/prisma/client";

/**
 * Phase 1 (P1-08) built durable GovernanceProfile/PolicyDocument storage
 * but never derived real content from Product State — every profile field
 * was manually entered and every policy document was empty scaffolding.
 * This module (Master Spec §31, §32, §34) closes that gap: security and
 * privacy requirements and a Governance Profile are deterministically
 * derived from a project's actual Blueprint content, and policy drafts are
 * generated from that real state — never fabricating the facts §34
 * explicitly forbids inventing (company identity, jurisdiction, contact
 * details), which remain bracketed placeholders and recorded open
 * questions until a customer supplies them. Never represented as legal
 * advice, certification, or guaranteed compliance (§32).
 */

export class NoBlueprintForAssessmentError extends Error {
  constructor() {
    super("This project has no Blueprint yet — nothing to assess.");
    this.name = "NoBlueprintForAssessmentError";
  }
}

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

export type DerivedGovernanceProfile = {
  dataCategories: string[];
  monetizationModel: string | null;
  relevantGovernanceDomains: string[];
};

/**
 * Grounded entirely in the current Blueprint: data categories from its
 * data models, monetization model from its monetization notes, governance
 * domains from the Feasibility-derived `governance` assessments already
 * carried on the Blueprint (P2-01). Facts no Blueprint content can imply —
 * business/user locations, product category, user age range, distribution
 * channels — are deliberately left unset rather than guessed; a customer
 * must supply them (Master Spec §32's jurisdiction profile).
 */
export function deriveGovernanceProfile(blueprint: Blueprint): DerivedGovernanceProfile {
  const dataModels = asDataModels(blueprint.dataModels);
  const monetizationNotes = asStringArray(blueprint.monetization);
  const governanceAssessments = Array.isArray(blueprint.governance)
    ? (blueprint.governance as Array<{ label?: unknown }>)
    : [];

  const dataCategories: string[] = [];
  if (dataModels.length > 0) {
    dataCategories.push(`Generated application data: ${dataModels.map((m) => m.name).join(", ")}`);
  }
  if (monetizationNotes.length > 0) {
    dataCategories.push("Payment/transaction data");
  }

  return {
    dataCategories,
    monetizationModel: monetizationNotes.length > 0 ? monetizationNotes.join("; ") : null,
    relevantGovernanceDomains: governanceAssessments
      .map((assessment) => assessment.label)
      .filter((label): label is string => typeof label === "string"),
  };
}

export async function syncGovernanceProfile(
  actorUserId: string,
  projectId: string,
): Promise<GovernanceProfile> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const blueprint = await getLatestBlueprint(actorUserId, projectId);
  if (!blueprint) {
    throw new NoBlueprintForAssessmentError();
  }

  const derived = deriveGovernanceProfile(blueprint);
  return upsertGovernanceProfile(actorUserId, projectId, {
    dataCategories: derived.dataCategories,
    monetizationModel: derived.monetizationModel ?? undefined,
    relevantGovernanceDomains: derived.relevantGovernanceDomains,
  });
}

export type SecurityPrivacyAssessment = {
  security: string[];
  privacy: string[];
};

/**
 * Master Spec §31's security/privacy requirement lists, narrowed to what
 * this Blueprint's actual content can honestly imply — not the full lists
 * verbatim, which would overstate what a template-generated product
 * genuinely requires.
 */
export function deriveSecurityPrivacyRequirements(blueprint: Blueprint): SecurityPrivacyAssessment {
  const security: string[] = [
    "Generated end users must authenticate before accessing their own data (GeneratedAppUser).",
    "All generated records are scoped to their owning project; no cross-tenant access path exists (P2-04).",
  ];
  const privacy: string[] = [];

  const dataModels = asDataModels(blueprint.dataModels);
  if (dataModels.length > 0) {
    privacy.push(
      `Personal/business data is collected via: ${dataModels.map((m) => m.name).join(", ")}. Retention and deletion policy is not yet configured.`,
    );
  }

  const monetization = asStringArray(blueprint.monetization);
  if (monetization.length > 0) {
    security.push(
      "Payment data must never be stored in plaintext; requires a PCI-compliant customer-owned payment processor (not yet connected).",
    );
    privacy.push(
      "Payment/transaction data requires disclosure in a Privacy Policy and is subject to the customer's chosen payment processor's own data practices.",
    );
  }

  const permissions = asStringArray(blueprint.permissions);
  if (permissions.length > 0) {
    security.push(
      "Owner-only actions must be restricted by role (see Blueprint roles/permissions).",
    );
  }

  return { security, privacy };
}

/**
 * Records the assessment as a ROUTINE Decision (the same Product-facing
 * Decision Ledger every other orchestration-level assessment uses) and
 * syncs the Governance Profile from the same Blueprint in one call.
 */
export async function recordSecurityPrivacyGovernanceAssessment(
  actorUserId: string,
  projectId: string,
): Promise<Decision> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const blueprint = await getLatestBlueprint(actorUserId, projectId);
  if (!blueprint) {
    throw new NoBlueprintForAssessmentError();
  }

  const assessment = deriveSecurityPrivacyRequirements(blueprint);
  await syncGovernanceProfile(actorUserId, projectId);

  return recordDecision(actorUserId, projectId, {
    source: "orchestration.governance-and-legal",
    summary: `Security, privacy, and governance requirements assessed for Blueprint v${blueprint.version}.`,
    disclosureTier: "ROUTINE",
    reason:
      "Deterministically derived from the current Blueprint's data models, monetization, and permissions — not a professional legal or security review.",
    impact: { security: assessment.security, privacy: assessment.privacy },
  });
}

const UNKNOWN_COMPANY_NAME = "[COMPANY NAME — not yet provided]";
const UNKNOWN_JURISDICTION = "[GOVERNING LAW / JURISDICTION — not yet provided]";
const UNKNOWN_CONTACT = "[CONTACT EMAIL/ADDRESS — not yet provided]";

const LEGAL_REVIEW_NOTICE =
  "This draft was generated deterministically from Product State and Blueprint content, not by a licensed attorney. It must be reviewed by qualified legal counsel before publication (Master Spec §34) and must not be represented as legal advice, certification, or guaranteed compliance (§32).";

function buildTermsOfServiceContent(input: {
  purpose: string;
  monetizationNotes: string[];
}): string {
  return [
    "# Terms of Service (DRAFT)",
    "",
    `${UNKNOWN_COMPANY_NAME} ("we", "us") provides ${input.purpose || "this product"}.`,
    "",
    "## Payments",
    "",
    input.monetizationNotes.length > 0
      ? `This product involves: ${input.monetizationNotes.join("; ")}. Billing and cancellation terms are governed by our payment processor's own terms, which is not yet connected.`
      : "This product does not currently collect payment.",
    "",
    "## Governing Law",
    "",
    `These Terms are governed by the laws of ${UNKNOWN_JURISDICTION}.`,
    "",
    "## Contact",
    "",
    `Questions about these Terms can be sent to ${UNKNOWN_CONTACT}.`,
    "",
    "---",
    "",
    LEGAL_REVIEW_NOTICE,
  ].join("\n");
}

function buildPrivacyPolicyContent(input: { dataCategories: string[] }): string {
  return [
    "# Privacy Policy (DRAFT)",
    "",
    `${UNKNOWN_COMPANY_NAME} collects the following categories of data:`,
    "",
    input.dataCategories.length > 0
      ? input.dataCategories.map((category) => `- ${category}`).join("\n")
      : "- No data categories have been identified from the current Blueprint yet.",
    "",
    "## Retention and Deletion",
    "",
    "A specific retention and deletion policy has not yet been configured for this product.",
    "",
    "## Third Parties",
    "",
    "No third-party data processors have been connected yet.",
    "",
    "## Contact",
    "",
    `Privacy questions can be sent to ${UNKNOWN_CONTACT}.`,
    "",
    "---",
    "",
    LEGAL_REVIEW_NOTICE,
  ].join("\n");
}

function buildAiDisclosureContent(): string {
  return [
    "# AI Disclosure (DRAFT)",
    "",
    "Portions of this product — its screens, workflows, and business logic — were generated using Pocket Studio's deterministic, template-based generation system. This is not a live AI model making product decisions; every generated artifact honestly discloses its own generation method (see generationMetadata on the underlying Blueprint). Real AI-model-backed generation is Phase 3 scope.",
    "",
    "---",
    "",
    LEGAL_REVIEW_NOTICE,
  ].join("\n");
}

export type GeneratablePolicyDocumentType = "TERMS_OF_SERVICE" | "PRIVACY_POLICY" | "AI_DISCLOSURE";

/**
 * Generates a real (if incomplete) policy draft from the project's actual
 * Blueprint/Product DNA content — never inventing the facts §34 forbids
 * inventing. Every genuinely unknown fact is a bracketed placeholder in
 * the content itself, and also recorded as a Product Memory OPEN_QUESTION
 * so it surfaces the same way every other open question does.
 */
export async function generatePolicyDraft(
  actorUserId: string,
  projectId: string,
  type: GeneratablePolicyDocumentType,
): Promise<PolicyDocument> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [blueprint, productState, productDNA] = await Promise.all([
    getLatestBlueprint(actorUserId, projectId),
    getLatestProductState(actorUserId, projectId),
    getLatestProductDNA(actorUserId, projectId),
  ]);
  if (!blueprint) {
    throw new NoBlueprintForAssessmentError();
  }

  const monetizationNotes = asStringArray(blueprint.monetization);
  const dataCategories = deriveGovernanceProfile(blueprint).dataCategories;
  const purpose = productDNA?.purpose ?? productState?.originalIdea ?? "";

  const content =
    type === "TERMS_OF_SERVICE"
      ? buildTermsOfServiceContent({ purpose, monetizationNotes })
      : type === "PRIVACY_POLICY"
        ? buildPrivacyPolicyContent({ dataCategories })
        : buildAiDisclosureContent();

  const draft = await createPolicyDocumentDraft(actorUserId, projectId, {
    type,
    content,
    basedOnProductStateVersion: productState?.version,
  });

  await addProductMemoryEntry(actorUserId, projectId, {
    type: "OPEN_QUESTION",
    content: `Policy draft "${type}" v${draft.version} still needs company name, governing law/jurisdiction, and contact details before it can be published.`,
  });

  return draft;
}
