import "server-only";
import { MockStoreReviewProvider } from "./mock-store-review-provider";
import type { StoreReviewProvider } from "./store-review-provider";

let cachedProvider: StoreReviewProvider | undefined;

/**
 * No env toggle — no real Apple/Google review integration is implemented
 * (see store-review-provider.ts). Kept as a selector function so a real
 * provider can be added later without changing any caller.
 */
export function getStoreReviewProvider(): StoreReviewProvider {
  if (!cachedProvider) {
    cachedProvider = new MockStoreReviewProvider();
  }
  return cachedProvider;
}
