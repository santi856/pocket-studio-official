import "server-only";
import type { ReviewInput, ReviewResult, StoreReviewProvider } from "./store-review-provider";

/**
 * Deterministic, no external calls. Approves any submission with a
 * positive build number — a real store would reject a malformed build
 * for the same reason, so this still exercises a genuine, reproducible
 * rejection path in tests.
 */
export class MockStoreReviewProvider implements StoreReviewProvider {
  readonly name = "mock" as const;

  async review(input: ReviewInput): Promise<ReviewResult> {
    if (input.buildNumber <= 0) {
      return { status: "REJECTED", reason: "Invalid build number." };
    }
    return { status: "APPROVED" };
  }
}
