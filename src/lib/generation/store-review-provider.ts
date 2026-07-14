import "server-only";
import type { StoreSubmissionPlatform } from "@/generated/prisma/client";

export type ReviewInput = {
  platform: StoreSubmissionPlatform;
  version: string;
  buildNumber: number;
};

export type ReviewResult = { status: "APPROVED" } | { status: "REJECTED"; reason: string };

/**
 * One interface, swappable implementations — the same pattern established
 * for AIProvider (P3-01), BillingProvider (P3-04), and DeploymentProvider
 * (P3-08). No real Apple/Google review API is implemented here (App Store
 * Connect and Google Play Developer API each require a live, verified
 * developer account this environment does not have, and real human
 * review takes days — nothing this build could simulate faithfully),
 * only a deterministic mock. The submission record-keeping and status
 * transitions in src/lib/generation/store-submissions.ts are real and
 * fully tested independent of which provider performs the underlying
 * review.
 */
export interface StoreReviewProvider {
  readonly name: "mock";
  review(input: ReviewInput): Promise<ReviewResult>;
}
