import "server-only";
import { MockDeploymentProvider } from "./mock-deployment-provider";
import type { DeploymentProvider } from "./deployment-provider";

let cachedProvider: DeploymentProvider | undefined;

/**
 * Unlike getEmailProvider/getGeneratedAppPaymentProvider, there is no env
 * toggle here — no real hosting provider is implemented (see
 * deployment-provider.ts), so a toggle would imply a choice that does not
 * exist yet. Kept as a selector function (not a direct export) so a real
 * provider can be added later without changing any caller.
 */
export function getDeploymentProvider(): DeploymentProvider {
  if (!cachedProvider) {
    cachedProvider = new MockDeploymentProvider();
  }
  return cachedProvider;
}
