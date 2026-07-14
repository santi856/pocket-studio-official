import { describe, expect, it } from "vitest";
import { MockDeploymentProvider } from "./mock-deployment-provider";

describe("MockDeploymentProvider", () => {
  const provider = new MockDeploymentProvider();

  it("succeeds for a valid Blueprint/Build Plan version pair", async () => {
    const result = await provider.deploy({
      environment: "PRODUCTION",
      projectSlug: "booking-app",
      blueprintVersion: 3,
      buildPlanVersion: 2,
    });

    expect(result.status).toBe("SUCCEEDED");
    if (result.status === "SUCCEEDED") {
      expect(result.providerDeploymentId).toMatch(/^mock_deploy_/);
    }
  });

  it("fails for a non-positive Blueprint version", async () => {
    const result = await provider.deploy({
      environment: "DEVELOPMENT",
      projectSlug: "booking-app",
      blueprintVersion: 0,
      buildPlanVersion: 1,
    });

    expect(result.status).toBe("FAILED");
  });

  it("fails for a non-positive Build Plan version", async () => {
    const result = await provider.deploy({
      environment: "DEVELOPMENT",
      projectSlug: "booking-app",
      blueprintVersion: 1,
      buildPlanVersion: -1,
    });

    expect(result.status).toBe("FAILED");
  });
});
