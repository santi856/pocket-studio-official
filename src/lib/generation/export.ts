import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { assertExportAllowed } from "@/lib/billing/entitlements";
import { getLatestProductState } from "@/lib/product/product-state";
import { getLatestProductDNA } from "@/lib/product/product-dna";
import { getLatestBlueprint } from "./blueprint";
import { getLatestBuildPlan } from "./build-plan";
import { listGeneratedRecords } from "./generated-records";
import { listGeneratedAppUsers } from "./generated-app-users";
import { listPolicyDocuments } from "@/lib/product/policy-documents";
import { getGovernanceProfile } from "@/lib/product/governance-profile";
import { listLatestTruthStatuses } from "@/lib/product/truth-status";

const EXPORT_VERSION = "1.0";

/**
 * Master Spec §25's "export foundation" — a structured, inspectable bundle
 * of everything durable this project has produced: Product State/DNA, the
 * latest Blueprint/Build Plan, every generated-app record, generated-app
 * user accounts (never their password hashes), policy drafts, the
 * Governance Profile, and Truth Status. Explicitly NOT a deployable code
 * package or a database backup — a future unit would need to add real
 * code-file generation and a genuine backup/restore mechanism (disclosed
 * here, not silently implied). Credentials (generated-app user
 * passwordHash, platform CredentialReference ciphertext) are never
 * included, by construction — this function does not even query those
 * columns.
 */
export type ProjectExportBundle = {
  exportedAt: string;
  exportVersion: string;
  project: { name: string; slug: string };
  productState: {
    version: number;
    originalIdea: string;
    outputTargets: unknown;
  } | null;
  productDNA: {
    version: number;
    purpose: string | null;
    targetUsers: unknown;
  } | null;
  blueprint: {
    version: number;
    validationStatus: string;
    screens: unknown;
    dataModels: unknown;
    roles: unknown;
  } | null;
  buildPlan: {
    version: number;
    planStatus: string;
    screenOrder: unknown;
    blockers: unknown;
  } | null;
  generatedRecords: Array<{ modelKey: string; data: unknown; createdAt: string }>;
  generatedAppUsers: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
  }>;
  policyDocuments: Array<{ type: string; version: number; status: string; content: string }>;
  governanceProfile: {
    dataCategories: unknown;
    monetizationModel: string | null;
    relevantGovernanceDomains: unknown;
  } | null;
  truthStatuses: Array<{ subjectKey: string; subjectLabel: string; status: string }>;
  disclosures: string[];
};

export async function exportProject(
  actorUserId: string,
  projectId: string,
): Promise<ProjectExportBundle> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");
  await assertExportAllowed(actorUserId, project.organizationId);

  const [
    productState,
    productDNA,
    blueprint,
    buildPlan,
    generatedRecords,
    generatedAppUsers,
    policyDocuments,
    governanceProfile,
    truthStatuses,
  ] = await Promise.all([
    getLatestProductState(actorUserId, projectId),
    getLatestProductDNA(actorUserId, projectId),
    getLatestBlueprint(actorUserId, projectId),
    getLatestBuildPlan(actorUserId, projectId),
    listGeneratedRecords(actorUserId, projectId),
    listGeneratedAppUsers(actorUserId, projectId),
    listPolicyDocuments(actorUserId, projectId),
    getGovernanceProfile(actorUserId, projectId),
    listLatestTruthStatuses(actorUserId, projectId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    exportVersion: EXPORT_VERSION,
    project: { name: project.name, slug: project.slug },
    productState: productState
      ? {
          version: productState.version,
          originalIdea: productState.originalIdea,
          outputTargets: productState.outputTargets,
        }
      : null,
    productDNA: productDNA
      ? {
          version: productDNA.version,
          purpose: productDNA.purpose,
          targetUsers: productDNA.targetUsers,
        }
      : null,
    blueprint: blueprint
      ? {
          version: blueprint.version,
          validationStatus: blueprint.validationStatus,
          screens: blueprint.screens,
          dataModels: blueprint.dataModels,
          roles: blueprint.roles,
        }
      : null,
    buildPlan: buildPlan
      ? {
          version: buildPlan.version,
          planStatus: buildPlan.planStatus,
          screenOrder: buildPlan.screenOrder,
          blockers: buildPlan.blockers,
        }
      : null,
    generatedRecords: generatedRecords.map((record) => ({
      modelKey: record.modelKey,
      data: record.data,
      createdAt: record.createdAt.toISOString(),
    })),
    generatedAppUsers: generatedAppUsers.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    })),
    policyDocuments: policyDocuments.map((doc) => ({
      type: doc.type,
      version: doc.version,
      status: doc.status,
      content: doc.content,
    })),
    governanceProfile: governanceProfile
      ? {
          dataCategories: governanceProfile.dataCategories,
          monetizationModel: governanceProfile.monetizationModel,
          relevantGovernanceDomains: governanceProfile.relevantGovernanceDomains,
        }
      : null,
    truthStatuses: truthStatuses.map((status) => ({
      subjectKey: status.subjectKey,
      subjectLabel: status.subjectLabel,
      status: status.status,
    })),
    disclosures: [
      "This export is a structured data bundle, not a deployable code package or a database backup. Real code-file/deployment export is not yet implemented.",
      "Generated end-user credentials (password hashes) are never included in this export.",
      "Customer-owned integration credentials (the credential vault) are never included in this export.",
    ],
  };
}
