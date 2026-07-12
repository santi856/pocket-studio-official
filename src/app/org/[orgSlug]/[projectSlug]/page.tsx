import Link from "next/link";
import { requireUserForPage } from "@/lib/web/require-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { getLatestProductState } from "@/lib/product/product-state";
import { getLatestProductDNA } from "@/lib/product/product-dna";
import { listDecisions } from "@/lib/product/decisions";
import { listLatestTruthStatuses } from "@/lib/product/truth-status";
import { listProductMemoryEntries } from "@/lib/product/product-memory";
import { submitIdeaAction, respondToDecisionAction } from "@/lib/actions/studio-actions";
import { AppNav } from "@/components/app-nav";
import { TruthBadge } from "@/components/truth-badge";

export default async function StudioSimpleModePage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}) {
  const user = await requireUserForPage();
  const { orgSlug, projectSlug } = await params;
  const { organization, project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  const [productState, productDNA, pendingDecisions, truthStatuses, openQuestions] =
    await Promise.all([
      getLatestProductState(user.id, project.id),
      getLatestProductDNA(user.id, project.id),
      listDecisions(user.id, project.id, { approvalStatus: "PENDING_APPROVAL" }),
      listLatestTruthStatuses(user.id, project.id),
      listProductMemoryEntries(user.id, project.id, { type: "OPEN_QUESTION" }),
    ]);

  const businessModelBrief = productState?.businessModelBrief as Record<string, unknown> | null;
  const monetizationRecommendations = productState?.monetizationRecommendations as Array<{
    option: string;
    tradeoff: string;
  }> | null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav userName={user.name} />
      <div className="border-b border-zinc-200 px-6 py-3 sm:px-10 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between text-sm">
          <div>
            <span className="text-zinc-500 dark:text-zinc-500">{organization.name} / </span>
            <span className="font-medium text-black dark:text-white">{project.name}</span>
          </div>
          <Link
            href={`/org/${orgSlug}/${projectSlug}/expert`}
            className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
          >
            Switch to Expert Mode
          </Link>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-10">
        {!productState ? (
          <section>
            <h1 className="text-xl font-semibold text-black dark:text-white">
              Describe your product
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Tell Pocket Studio what you want to build. For example: &ldquo;Build a premium booking
              app for mobile detailers.&rdquo;
            </p>
            <IdeaForm orgSlug={orgSlug} projectSlug={projectSlug} />
          </section>
        ) : (
          <>
            <section>
              <h1 className="text-xl font-semibold text-black dark:text-white">
                {productDNA?.purpose ?? productState.originalIdea}
              </h1>
              {productDNA?.targetUsers ? (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  For: {(productDNA.targetUsers as string[]).join(", ")}
                </p>
              ) : null}
            </section>

            {pendingDecisions.length > 0 && (
              <section className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
                <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Needs your approval
                </h2>
                <ul className="mt-3 flex flex-col gap-4">
                  {pendingDecisions.map((decision) => (
                    <li key={decision.id} className="text-sm">
                      <p className="text-amber-900 dark:text-amber-200">{decision.summary}</p>
                      {decision.reason && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          {decision.reason}
                        </p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <form action={respondToDecisionAction}>
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="projectSlug" value={projectSlug} />
                          <input type="hidden" name="decisionId" value={decision.id} />
                          <input type="hidden" name="approve" value="true" />
                          <button
                            type="submit"
                            className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white dark:bg-amber-200 dark:text-amber-950"
                          >
                            Approve
                          </button>
                        </form>
                        <form action={respondToDecisionAction}>
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="projectSlug" value={projectSlug} />
                          <input type="hidden" name="decisionId" value={decision.id} />
                          <input type="hidden" name="approve" value="false" />
                          <button
                            type="submit"
                            className="rounded-full border border-amber-900 px-3 py-1 text-xs font-medium text-amber-900 dark:border-amber-200 dark:text-amber-200"
                          >
                            Decline
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-10">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                Preview
              </h2>
              <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-500">
                Full-stack generation is not yet available (Phase 2). Nothing has been built for
                this product yet.
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                Business
              </h2>
              {businessModelBrief ? (
                <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <Field label="Revenue model" value={String(businessModelBrief.revenueModel)} />
                  <Field label="Pricing" value={String(businessModelBrief.pricingAssumptions)} />
                  <Field
                    label="Operational complexity"
                    value={String(businessModelBrief.operationalComplexity)}
                  />
                  <Field
                    label="Refund/dispute risk"
                    value={String(businessModelBrief.refundDisputeRisk)}
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Not yet generated.</p>
              )}

              {monetizationRecommendations && monetizationRecommendations.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2">
                  {monetizationRecommendations.map((option) => (
                    <li
                      key={option.option}
                      className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                    >
                      <span className="font-medium text-black dark:text-white">
                        {option.option}
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400"> — {option.tradeoff}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                Trust
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                What Pocket Studio has actually assessed for this product so far.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {truthStatuses.map((status) => (
                  <li
                    key={status.id}
                    className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <span className="text-black dark:text-white">{status.subjectLabel}</span>
                    <TruthBadge status={status.status} />
                  </li>
                ))}
              </ul>
            </section>

            {openQuestions.length > 0 && (
              <section className="mt-10">
                <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                  Open questions
                </h2>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  {openQuestions.map((question) => (
                    <li key={question.id}>{question.content}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-10">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                Continue the conversation
              </h2>
              <IdeaForm orgSlug={orgSlug} projectSlug={projectSlug} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500 dark:text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-black dark:text-white">{value}</dd>
    </div>
  );
}

function IdeaForm({ orgSlug, projectSlug }: { orgSlug: string; projectSlug: string }) {
  return (
    <form action={submitIdeaAction} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="projectSlug" value={projectSlug} />
      <textarea
        name="text"
        required
        rows={3}
        placeholder="Describe your product idea..."
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        className="self-start rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Send
      </button>
    </form>
  );
}
