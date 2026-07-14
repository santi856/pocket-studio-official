import "server-only";
import type { DeployInput, DeployResult, DeploymentProvider } from "./deployment-provider";

/**
 * Deterministic, no external calls. Succeeds for any request whose
 * Blueprint/Build Plan versions are positive (the only shape a real
 * provider could not accept either), so the deployment/rollback flow can
 * be built and tested end to end without a live hosting account.
 */
export class MockDeploymentProvider implements DeploymentProvider {
  readonly name = "mock" as const;

  async deploy(input: DeployInput): Promise<DeployResult> {
    if (input.blueprintVersion <= 0 || input.buildPlanVersion <= 0) {
      return { status: "FAILED", failureReason: "Invalid Blueprint or Build Plan version." };
    }
    return { status: "SUCCEEDED", providerDeploymentId: `mock_deploy_${crypto.randomUUID()}` };
  }
}
