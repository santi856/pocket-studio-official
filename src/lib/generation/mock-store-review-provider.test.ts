import { describe, expect, it } from "vitest";
import { MockStoreReviewProvider } from "./mock-store-review-provider";

describe("MockStoreReviewProvider", () => {
  const provider = new MockStoreReviewProvider();

  it("approves a submission with a positive build number", async () => {
    const result = await provider.review({ platform: "IOS", version: "1.0.0", buildNumber: 3 });

    expect(result.status).toBe("APPROVED");
  });

  it("rejects a submission with a non-positive build number", async () => {
    const result = await provider.review({ platform: "ANDROID", version: "1.0.0", buildNumber: 0 });

    expect(result.status).toBe("REJECTED");
    if (result.status === "REJECTED") {
      expect(result.reason).toBeTruthy();
    }
  });
});
