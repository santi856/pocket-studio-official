import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import {
  IntegrationRequirementNotFoundError,
  retrieveCredentialSecret,
  storeCredential,
} from "@/lib/credentials/vault";

// A real consent screen takes real human time to click through — generous
// enough for that, short enough to bound how long a leaked/observed state
// value stays exploitable.
const STATE_EXPIRY_MS = 10 * 60 * 1000;
const TOKEN_EXCHANGE_TIMEOUT_MS = 30_000;

export type OAuthProviderConfig = {
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri: string;
};

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
};

export class OAuthStateMismatchError extends Error {
  constructor() {
    super("This authorization request is invalid or has expired.");
    this.name = "OAuthStateMismatchError";
  }
}

export class OAuthCallbackActorMismatchError extends Error {
  constructor() {
    super("This authorization callback does not match the session that started it.");
    this.name = "OAuthCallbackActorMismatchError";
  }
}

export class OAuthTokenExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthTokenExchangeError";
  }
}

/**
 * Real, generic OAuth2 authorization-code flow (Master Spec §61 "OAuth
 * where supported") — provider-agnostic by design: an OAuthProviderConfig
 * is data (URLs, client credentials, scopes), not a swappable
 * implementation like AIProvider/BillingProvider, since the protocol
 * itself is a fixed standard once the provider's endpoints are known.
 * Step 1: generate a server-tracked, single-use, short-lived `state`
 * value (real CSRF protection — a client-supplied state alone proves
 * nothing) and return the URL to redirect the customer's browser to.
 */
export async function beginOAuthConnection(
  actorUserId: string,
  projectId: string,
  integrationRequirementId: string,
  config: OAuthProviderConfig,
): Promise<{ authorizeUrl: string }> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const requirement = await db.integrationRequirement.findFirst({
    where: { id: integrationRequirementId, projectId },
  });
  if (!requirement) {
    throw new IntegrationRequirementNotFoundError();
  }

  const state = randomBytes(32).toString("base64url");
  await db.oAuthConnectionState.create({
    data: { state, projectId, integrationRequirementId, createdByUserId: actorUserId },
  });

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);

  return { authorizeUrl: url.toString() };
}

async function exchangeCodeForTokens(
  code: string,
  config: OAuthProviderConfig,
): Promise<OAuthTokenSet> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OAuthTokenExchangeError(
        `Token exchange request timed out after ${TOKEN_EXCHANGE_TIMEOUT_MS}ms.`,
      );
    }
    throw new OAuthTokenExchangeError(
      `Token exchange request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new OAuthTokenExchangeError(
      `Token endpoint returned ${response.status}: ${body.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new OAuthTokenExchangeError("Token endpoint response did not include an access_token.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:
      typeof data.expires_in === "number"
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
  };
}

/**
 * Step 2: the provider's callback redirect lands here with `state` and
 * `code`. The state row is consumed (deleted) unconditionally before any
 * other check — a failed exchange must never leave a replayable state
 * behind. Requires the current session's actor to be the same one that
 * began the flow (an extra guard beyond the state value itself, cheap and
 * defensible). The resulting token set is stored through the existing
 * credential vault (AES-256-GCM, src/lib/credentials/crypto.ts) exactly
 * like a manually-pasted API key — OAuth tokens are not a different
 * security tier.
 */
export async function completeOAuthConnection(
  actorUserId: string,
  state: string,
  code: string,
  config: OAuthProviderConfig,
): Promise<void> {
  const pending = await db.oAuthConnectionState.findUnique({ where: { state } });
  if (!pending) {
    throw new OAuthStateMismatchError();
  }
  await db.oAuthConnectionState.delete({ where: { id: pending.id } });

  const isExpired = Date.now() - pending.createdAt.getTime() > STATE_EXPIRY_MS;
  if (isExpired) {
    throw new OAuthStateMismatchError();
  }
  if (pending.createdByUserId !== actorUserId) {
    throw new OAuthCallbackActorMismatchError();
  }

  await requireProjectAccess(actorUserId, pending.projectId, "MEMBER");

  const tokens = await exchangeCodeForTokens(code, config);

  await storeCredential(actorUserId, pending.projectId, {
    integrationRequirementId: pending.integrationRequirementId,
    provider: config.name,
    secret: JSON.stringify(tokens),
  });

  await db.integrationRequirement.update({
    where: { id: pending.integrationRequirementId },
    data: { connectionStatus: "CONNECTED" },
  });
}

/** Decodes the stored token set back out of the vault — never logs or otherwise exposes it. */
export async function getConnectedTokenSet(
  actorUserId: string,
  projectId: string,
  integrationRequirementId: string,
): Promise<OAuthTokenSet | null> {
  const secret = await retrieveCredentialSecret(actorUserId, projectId, integrationRequirementId);
  if (!secret) return null;
  return JSON.parse(secret) as OAuthTokenSet;
}

/** Storage hygiene for abandoned flows (a customer who never completes the provider's consent screen). */
export async function deleteExpiredOAuthConnectionStates(): Promise<number> {
  const result = await db.oAuthConnectionState.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - STATE_EXPIRY_MS) } },
  });
  return result.count;
}
