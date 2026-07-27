import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import { getLatestPlan } from "@/lib/billing/plans";
import { getAccessLevel } from "@/lib/billing/access";
import type { PlanKey } from "@/generated/prisma/client";

export class ProjectLimitExceededError extends Error {
  constructor(readonly limit: number) {
    super(
      `This workspace's plan allows up to ${limit} project${limit === 1 ? "" : "s"}. Upgrade to create more.`,
    );
    this.name = "ProjectLimitExceededError";
  }
}

/**
 * Master Spec §37's nonpayment/cancellation restriction actually
 * restricting a paid feature, not just describing that it should
 * (staging-readiness sprint follow-up, 2026-07-26): a real, confirmed gap
 * found while verifying Task 1's "cancelled or failed subscriptions
 * correctly restrict paid features" — resolveEntitlements previously
 * looked only at planKey, never at billingState, so an organization whose
 * subscription was CANCELED, SUSPENDED, RESTRICTED, EXPIRED, or
 * RETENTION_PERIOD/DELETION_SCHEDULED kept creating new projects under its
 * last-known plan's limit forever. RESTRICTED_CAPABILITIES (access.ts)
 * preserves "read_only_projects" during restriction, not "create new
 * projects" — this is that distinction actually enforced. Export
 * ("portability_export") is deliberately left untouched here: Master Spec
 * §37 preserves data portability even while restricted, so
 * assertExportAllowed below intentionally does not gain this same check.
 */
export class OrganizationAccessRestrictedError extends Error {
  constructor() {
    super(
      "This workspace's billing access is currently restricted — resolve your billing status to create new projects.",
    );
    this.name = "OrganizationAccessRestrictedError";
  }
}

export class ExportNotAllowedError extends Error {
  constructor() {
    super("Exporting a generated app is not included in this workspace's current plan.");
    this.name = "ExportNotAllowedError";
  }
}

// Mirrors src/lib/billing/seed-plans.ts's INITIAL_PLANS shape exactly.
// Parsed (not blindly cast) since entitlements are stored as untyped JSON
// (Master Spec §36: "configurable pricing and entitlements") — a
// malformed plan record must fail loudly here, never silently pass
// through as `undefined` and be treated as "no limit."
const entitlementsSchema = z.object({
  projectLimit: z.number().nullable(),
  storageMb: z.number().nullable(),
  exportAllowed: z.boolean(),
  deploymentAllowed: z.boolean(),
  teamSeats: z.number().nullable(),
});

export type PlanEntitlements = z.infer<typeof entitlementsSchema>;

const DEFAULT_PLAN_KEY: PlanKey = "FREE_EXPLORE";

// Used only when the Plan Registry itself has no entry for the resolved
// plan key — a platform configuration gap (seedPlans() was never run in
// this environment), not a real customer's usage exceeding a real policy.
// There is no policy to enforce yet in that case, so this fails open
// rather than blocking every project/export operation platform-wide on a
// seed-data gap — the same "no registry entry -> do not block" posture
// D-0011 already established for the Capability Registry (NOT_EVALUATED,
// not UNSUPPORTED). Once a real plan exists, its real entitlements govern
// normally, including real blocking.
const UNRESTRICTED_ENTITLEMENTS: PlanEntitlements = {
  projectLimit: null,
  storageMb: null,
  exportAllowed: true,
  deploymentAllowed: true,
  teamSeats: null,
};

/**
 * Resolves the entitlements actually governing an organization right now.
 * Falls back to the default plan (matching
 * `OrganizationSubscription.planKey`'s own `@default(FREE_EXPLORE)` in
 * prisma/schema.prisma) when the organization has no subscription row yet
 * — a real, brief state between organization creation and subscription
 * creation (createOrganizationAction creates both, but not atomically),
 * not a gap to silently ignore or fail closed on. Every real organization
 * created through the actual product flow gets a subscription in the same
 * request; this fallback exists so that brief window (and any
 * organization created without one) is governed by the same default the
 * schema itself declares, not treated as unlimited.
 */
async function resolveEntitlements(
  actorUserId: string,
  organizationId: string,
): Promise<PlanEntitlements> {
  await requireOrganizationMembership(actorUserId, organizationId, "MEMBER");

  const subscription = await db.organizationSubscription.findUnique({ where: { organizationId } });
  const planKey = subscription?.planKey ?? DEFAULT_PLAN_KEY;

  const plan = await getLatestPlan(planKey);
  if (!plan) {
    return UNRESTRICTED_ENTITLEMENTS;
  }

  return entitlementsSchema.parse(plan.entitlements);
}

export type OrganizationUsage = {
  projectCount: number;
};

/**
 * Real usage metering — today this measures the one thing this codebase
 * can count honestly and directly: how many projects an organization
 * actually has. `storageMb` is a declared entitlement with no real
 * metering behind it yet — no blob storage or export byte-size tracking
 * exists anywhere in this codebase to measure against, so it is not
 * enforced here rather than backed by an invented number.
 */
export async function getOrganizationUsage(
  actorUserId: string,
  organizationId: string,
): Promise<OrganizationUsage> {
  await requireOrganizationMembership(actorUserId, organizationId, "MEMBER");

  const projectCount = await db.project.count({ where: { organizationId } });
  return { projectCount };
}

export async function assertWithinProjectLimit(
  actorUserId: string,
  organizationId: string,
): Promise<void> {
  const entitlements = await resolveEntitlements(actorUserId, organizationId);

  // Checked before the plan's own projectLimit — a restricted
  // organization's real problem is its billing status, not which number
  // its last-known plan happened to allow.
  const subscription = await db.organizationSubscription.findUnique({ where: { organizationId } });
  if (subscription && getAccessLevel(subscription.billingState) !== "full") {
    throw new OrganizationAccessRestrictedError();
  }

  if (entitlements.projectLimit === null) return;

  const usage = await getOrganizationUsage(actorUserId, organizationId);
  if (usage.projectCount >= entitlements.projectLimit) {
    throw new ProjectLimitExceededError(entitlements.projectLimit);
  }
}

export async function assertExportAllowed(
  actorUserId: string,
  organizationId: string,
): Promise<void> {
  const entitlements = await resolveEntitlements(actorUserId, organizationId);
  if (!entitlements.exportAllowed) {
    throw new ExportNotAllowedError();
  }
}
