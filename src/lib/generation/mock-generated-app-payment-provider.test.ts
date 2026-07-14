import { describe, expect, it } from "vitest";
import { MockGeneratedAppPaymentProvider } from "./mock-generated-app-payment-provider";

describe("MockGeneratedAppPaymentProvider", () => {
  const provider = new MockGeneratedAppPaymentProvider();

  it("succeeds for a positive amount", async () => {
    const result = await provider.createCharge({
      accessToken: "mock",
      amountCents: 5000,
      currency: "usd",
      description: "Appointment deposit",
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result).toHaveProperty("providerChargeId");
  });

  it("fails for a zero or negative amount, the same as a real provider would reject it", async () => {
    const result = await provider.createCharge({
      accessToken: "mock",
      amountCents: 0,
      currency: "usd",
      description: "Invalid",
    });

    expect(result.status).toBe("FAILED");
  });

  it("generates a unique charge id per call", async () => {
    const first = await provider.createCharge({
      accessToken: "mock",
      amountCents: 100,
      currency: "usd",
      description: "a",
    });
    const second = await provider.createCharge({
      accessToken: "mock",
      amountCents: 100,
      currency: "usd",
      description: "b",
    });

    expect(first.status).toBe("SUCCEEDED");
    expect(second.status).toBe("SUCCEEDED");
    if (first.status === "SUCCEEDED" && second.status === "SUCCEEDED") {
      expect(first.providerChargeId).not.toBe(second.providerChargeId);
    }
  });
});
