import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestProductState } from "@/lib/product/product-state";
import { getLatestBlueprint } from "./blueprint";
import { getLatestTruthStatus, setTruthStatus } from "@/lib/product/truth-status";
import { listPolicyDocuments } from "@/lib/product/policy-documents";
import { recordEvidence } from "@/lib/product/evidence";

/**
 * Master Spec §42: mobile-commerce classification. Derived from the
 * project's real original idea text, using the same word-boundary keyword
 * discipline already established in impact-analysis.ts (P1-04) — not from
 * Blueprint.monetization's own text, which is a fixed template string
 * (blueprint-templates.ts) with no distinguishing signal between
 * transaction types. "Never assume one payment method is permitted for
 * every mobile transaction" (§42) — an idea whose monetization signal
 * doesn't match any category keyword is honestly `unclassified`, not
 * guessed into the nearest-sounding one.
 */
export const MOBILE_COMMERCE_CATEGORIES = [
  "physical_goods",
  "physical_services",
  "digital_goods",
  "digital_content",
  "digital_subscriptions",
  "application_functionality",
  "donations",
  "marketplaces",
  "regulated_products",
  "external_account_access",
] as const;

export type MobileCommerceCategory = (typeof MOBILE_COMMERCE_CATEGORIES)[number];

const CATEGORY_KEYWORDS: Record<MobileCommerceCategory, readonly string[]> = {
  physical_goods: ["ship", "shipping", "merchandise", "inventory", "product order"],
  physical_services: [
    "appointment",
    "booking",
    "in-person",
    "on-site",
    "detailing",
    "cleaning",
    "repair",
    "house call",
  ],
  digital_goods: ["download", "digital product", "ebook", "software license"],
  digital_content: ["streaming", "video content", "articles", "course content"],
  digital_subscriptions: ["subscription", "membership", "recurring plan", "monthly plan"],
  application_functionality: ["premium feature", "unlock", "in-app purchase", "ad-free"],
  donations: ["donate", "donation", "tip jar", "charity"],
  marketplaces: ["marketplace", "multi-vendor", "sellers", "commission"],
  regulated_products: [
    "alcohol",
    "tobacco",
    "firearm",
    "cannabis",
    "prescription",
    "controlled substance",
  ],
  external_account_access: ["connect your bank", "linked account", "third-party account"],
};

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContainsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}`, "i").test(text);
}

export type MobileCommerceClassification = {
  hasCommerce: boolean;
  categories: MobileCommerceCategory[];
  unclassified: boolean;
};

export function classifyMobileCommerce(
  originalIdea: string,
  monetizationNotes: string[],
): MobileCommerceClassification {
  const hasCommerce = monetizationNotes.length > 0;
  if (!hasCommerce) {
    return { hasCommerce: false, categories: [], unclassified: false };
  }

  const categories = (
    Object.entries(CATEGORY_KEYWORDS) as Array<[MobileCommerceCategory, readonly string[]]>
  )
    .filter(([, keywords]) =>
      keywords.some((keyword) => textContainsKeyword(originalIdea, keyword)),
    )
    .map(([category]) => category);

  return { hasCommerce, categories, unclassified: categories.length === 0 };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export class NoBlueprintForStoreReadinessError extends Error {
  constructor() {
    super("This project has no Blueprint yet — nothing to assess for store readiness.");
    this.name = "NoBlueprintForStoreReadinessError";
  }
}

export type StoreReadinessCheck = { name: string; ready: boolean; details: string };

export type StoreReadinessResult = {
  readinessStatus: "NOT_READY";
  targetPlatforms: readonly ["ios", "android"];
  mobileCommerce: MobileCommerceClassification;
  checks: StoreReadinessCheck[];
  blockers: string[];
};

/**
 * Master Spec §44's Store Readiness Engine — real checks against real
 * project state (mirroring the Quality Gate's discipline, P2-10), never a
 * self-report. `readinessStatus` is honestly always `NOT_READY` regardless
 * of how many individual checks pass: §44 itself requires explicit
 * customer approval before submitting a production application or
 * accepting a marketplace agreement, which this build can never perform
 * on a customer's behalf. The "developer account connected" check itself
 * is real (P3-09, src/lib/generation/store-submissions.ts) — it queries
 * the actual IntegrationRequirement connection state, not a hardcoded
 * value.
 */
export async function assessStoreReadiness(
  actorUserId: string,
  projectId: string,
): Promise<StoreReadinessResult> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [productState, blueprint] = await Promise.all([
    getLatestProductState(actorUserId, projectId),
    getLatestBlueprint(actorUserId, projectId),
  ]);
  if (!blueprint) {
    throw new NoBlueprintForStoreReadinessError();
  }

  const monetization = asStringArray(blueprint.monetization);
  const mobileCommerce = classifyMobileCommerce(productState?.originalIdea ?? "", monetization);

  const [iosStatus, policies, developerAccounts] = await Promise.all([
    getLatestTruthStatus(actorUserId, projectId, "output.ios"),
    listPolicyDocuments(actorUserId, projectId),
    db.integrationRequirement.findMany({
      where: {
        projectId,
        category: { in: ["apple_developer_account", "google_play_account"] },
      },
    }),
  ]);
  const connectedDeveloperAccounts = developerAccounts.filter(
    (account) => account.connectionStatus === "CONNECTED",
  );

  const checks: StoreReadinessCheck[] = [
    {
      name: "Mobile project generated and syntax-validated",
      ready: iosStatus?.status === "IMPLEMENTED",
      details: iosStatus?.rationale ?? "No mobile project has been generated yet (P2-15).",
    },
    {
      name: "Mobile-commerce classification resolved",
      ready: !mobileCommerce.hasCommerce || !mobileCommerce.unclassified,
      details: mobileCommerce.unclassified
        ? "Monetization is present but its mobile-commerce category could not be determined from the stated idea — insufficient information, not assumed."
        : mobileCommerce.hasCommerce
          ? `Classified as: ${mobileCommerce.categories.join(", ")}.`
          : "No monetization present in the current Blueprint.",
    },
    {
      name: "Terms of Service drafted",
      ready: policies.some((doc) => doc.type === "TERMS_OF_SERVICE"),
      details: "Required before any production submission (P2-11).",
    },
    {
      name: "Privacy Policy drafted",
      ready: policies.some((doc) => doc.type === "PRIVACY_POLICY"),
      details: "Required before any production submission (P2-11).",
    },
    {
      name: "Apple/Google developer account connected",
      ready: connectedDeveloperAccounts.length > 0,
      details:
        connectedDeveloperAccounts.length > 0
          ? `Connected: ${connectedDeveloperAccounts.map((account) => account.category).join(", ")}.`
          : "No Apple or Google developer account is connected yet — required before any real store submission (P3-09, src/lib/generation/store-submissions.ts).",
    },
  ];

  const blockers = checks.filter((check) => !check.ready).map((check) => check.name);

  await recordEvidence(actorUserId, projectId, {
    evidenceType: "QUALITY_GATE_CHECK",
    subjectKey: "store.readiness",
    verificationMethod: checks.map((check) => check.name).join("; "),
    result: `NOT_READY — ${blockers.join("; ")}`,
    limitations:
      "Store Readiness can never report READY in this build: no Apple/Google developer account integration exists, and Master Spec §44 requires explicit customer approval before any real submission regardless.",
  });

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "store.readiness",
    subjectLabel: "App Store / Play Store readiness",
    status: "BLOCKED",
    rationale: `Blocked: ${blockers.join("; ")}`,
  });

  return {
    readinessStatus: "NOT_READY",
    targetPlatforms: ["ios", "android"],
    mobileCommerce,
    checks,
    blockers,
  };
}
