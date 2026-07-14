import { notFound } from "next/navigation";
import { requireUserForPage } from "@/lib/web/require-user";
import { resolveOrganizationForRoute } from "@/lib/web/resolve-project";
import { getEntitlements, getSubscription } from "@/lib/billing/subscription";
import { getOrganizationUsage } from "@/lib/billing/entitlements";
import { getAccessLevel } from "@/lib/billing/access";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { AppNav } from "@/components/app-nav";

export default async function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const user = await requireUserForPage();
  const { orgSlug } = await params;
  const organization = await resolveOrganizationForRoute(orgSlug);

  let subscription;
  let entitlements;
  let usage;
  try {
    subscription = await getSubscription(user.id, organization.id);
    entitlements = subscription ? await getEntitlements(user.id, organization.id) : null;
    usage = await getOrganizationUsage(user.id, organization.id);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      notFound();
    }
    throw err;
  }

  const accessLevel = subscription ? getAccessLevel(subscription.billingState) : "full";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav userName={user.name} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10 sm:px-10">
        <h1 className="text-xl font-semibold text-black dark:text-white">Billing</h1>

        {!subscription ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            No subscription found for this workspace.
          </p>
        ) : (
          <div className="mt-6 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-medium text-black dark:text-white">
                {entitlements?.planKey.replace("_", " / ")}
              </span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {subscription.billingState}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Access level: <span className="font-medium">{accessLevel}</span>
            </p>

            {entitlements && (
              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                {Object.entries(entitlements.entitlements).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-zinc-500 dark:text-zinc-500">{key}</dt>
                    <dd className="font-medium text-black dark:text-white">
                      {key === "projectLimit"
                        ? `${usage?.projectCount ?? 0} / ${value === null ? "Unlimited" : String(value)}`
                        : value === null
                          ? "Unlimited"
                          : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
              Live billing, checkout, and plan changes are not yet available. Pocket Studio does not
              charge you during this phase.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
