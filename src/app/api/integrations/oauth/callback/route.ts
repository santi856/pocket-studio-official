import { NextResponse } from "next/server";
import { requireCurrentUser, UnauthenticatedError } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import {
  completeOAuthConnection,
  OAuthCallbackActorMismatchError,
  OAuthStateMismatchError,
  OAuthTokenExchangeError,
} from "@/lib/integrations/oauth";
import { getOAuthProviderConfig } from "@/lib/integrations/oauth-provider-registry";

/**
 * The real OAuth2 authorization-code callback (Master Spec §61 "OAuth
 * where supported"). A provider redirects the customer's browser here
 * with either `state`+`code` (consent granted) or `state`+`error`
 * (consent denied) — both are real, expected outcomes, never crashes.
 * Requires the platform session to still be authenticated (a real OAuth
 * redirect keeps the browser's own cookies) and additionally requires
 * that session's user to match whoever began the flow
 * (completeOAuthConnection's own check) — two independent authentication
 * layers, not one.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");

  if (!state) {
    return new NextResponse("Missing state parameter.", { status: 400 });
  }

  const pending = await db.oAuthConnectionState.findUnique({ where: { state } });

  if (providerError) {
    // A real, expected outcome (the customer declined consent on the
    // provider's own screen) — clean up the now-dead state and report it
    // plainly, never a crash.
    if (pending) {
      await db.oAuthConnectionState.delete({ where: { id: pending.id } });
    }
    // Same actor check as the success path below (Level 3 review round 2,
    // finding 3): resolving the real org/project slug for whoever holds
    // `state` — even on a provider-declined-consent redirect — would leak
    // it to a request that has not proven it belongs to the same user who
    // began this flow. A mismatched or absent `pending` falls back to a
    // generic destination.
    const destination =
      pending && pending.createdByUserId === user.id
        ? await redirectDestination(pending.projectId)
        : "/dashboard";
    return NextResponse.redirect(
      new URL(`${destination}?integrationError=${encodeURIComponent(providerError)}`, request.url),
    );
  }

  if (!pending || !code) {
    return new NextResponse("Invalid or expired authorization request.", { status: 400 });
  }

  const requirement = await db.integrationRequirement.findUnique({
    where: { id: pending.integrationRequirementId },
  });
  const providerName = requirement?.selectedProvider;
  const config = providerName ? getOAuthProviderConfig(providerName) : null;
  if (!config) {
    return new NextResponse(
      `No OAuth configuration is registered for provider "${providerName ?? "unknown"}".`,
      { status: 400 },
    );
  }

  try {
    await completeOAuthConnection(user.id, state, code, config);
  } catch (error) {
    if (
      error instanceof OAuthStateMismatchError ||
      error instanceof OAuthCallbackActorMismatchError ||
      error instanceof OAuthTokenExchangeError
    ) {
      // Resolve to a generic path, never the real org/project slug this
      // callback has not yet proven the caller is authorized to see
      // (Level 3 review round 1, DEFECT 5) — the actor-mismatch/state-
      // mismatch/token-exchange failure means this request has not
      // established the right to know where `pending.projectId` lives.
      return NextResponse.redirect(
        new URL(`/dashboard?integrationError=${encodeURIComponent(error.message)}`, request.url),
      );
    }
    throw error;
  }

  const destination = await redirectDestination(pending.projectId);
  return NextResponse.redirect(new URL(`${destination}?integrationConnected=1`, request.url));
}

async function redirectDestination(projectId: string): Promise<string> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { organization: true },
  });
  if (!project) {
    return "/dashboard";
  }
  return `/org/${project.organization.slug}/${project.slug}`;
}
