// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { upsertIntegrationRequirement } from "@/lib/product/integrations";
import { IntegrationRequirementNotFoundError } from "@/lib/credentials/vault";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  beginOAuthConnection,
  completeOAuthConnection,
  deleteExpiredOAuthConnectionStates,
  getConnectedTokenSet,
  OAuthCallbackActorMismatchError,
  OAuthStateMismatchError,
  OAuthTokenExchangeError,
} from "./oauth";
import type { OAuthProviderConfig } from "./oauth";

const FAKE_PROVIDER: OAuthProviderConfig = {
  name: "example-provider",
  authorizeUrl: "https://provider.example.com/oauth/authorize",
  tokenUrl: "https://provider.example.com/oauth/token",
  clientId: "client_abc",
  clientSecret: "secret_xyz",
  scopes: ["read", "write"],
  redirectUri: "https://pocketstudio.example.com/api/integrations/oauth/callback",
};

describe("OAuth connection flow", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithRequirement() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    const requirement = await upsertIntegrationRequirement(owner.id, project.id, {
      category: "analytics",
      purpose: "Track customer engagement",
      requirementLevel: "OPTIONAL",
      owner: "CUSTOMER",
      connectionStatus: "SETUP_NEEDED",
    });
    return { owner, outsider, project, requirement };
  }

  function mockTokenResponse(body: unknown, ok = true, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response),
    );
  }

  describe("beginOAuthConnection", () => {
    it("creates a single-use state and returns a correctly-formed authorize URL", async () => {
      const { owner, project, requirement } = await seedProjectWithRequirement();

      const { authorizeUrl } = await beginOAuthConnection(
        owner.id,
        project.id,
        requirement.id,
        FAKE_PROVIDER,
      );

      const url = new URL(authorizeUrl);
      expect(url.origin + url.pathname).toBe(FAKE_PROVIDER.authorizeUrl);
      expect(url.searchParams.get("client_id")).toBe("client_abc");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toBe("read write");
      const state = url.searchParams.get("state");
      expect(state).toBeTruthy();

      const stored = await db.oAuthConnectionState.findUnique({ where: { state: state! } });
      expect(stored?.projectId).toBe(project.id);
      expect(stored?.integrationRequirementId).toBe(requirement.id);
      expect(stored?.createdByUserId).toBe(owner.id);
    });

    it("throws IntegrationRequirementNotFoundError for a nonexistent requirement", async () => {
      const { owner, project } = await seedProjectWithRequirement();

      await expect(
        beginOAuthConnection(owner.id, project.id, "not-a-real-id", FAKE_PROVIDER),
      ).rejects.toBeInstanceOf(IntegrationRequirementNotFoundError);
    });

    it("denies a non-member (tenant isolation)", async () => {
      const { outsider, project, requirement } = await seedProjectWithRequirement();

      await expect(
        beginOAuthConnection(outsider.id, project.id, requirement.id, FAKE_PROVIDER),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("completeOAuthConnection", () => {
    it("exchanges the code, stores the token set, and marks the integration connected", async () => {
      const { owner, project, requirement } = await seedProjectWithRequirement();
      const { authorizeUrl } = await beginOAuthConnection(
        owner.id,
        project.id,
        requirement.id,
        FAKE_PROVIDER,
      );
      const state = new URL(authorizeUrl).searchParams.get("state")!;
      mockTokenResponse({
        access_token: "real_access_token",
        refresh_token: "real_refresh_token",
        expires_in: 3600,
      });

      await completeOAuthConnection(owner.id, state, "auth_code_123", FAKE_PROVIDER);

      const tokens = await getConnectedTokenSet(owner.id, project.id, requirement.id);
      expect(tokens?.accessToken).toBe("real_access_token");
      expect(tokens?.refreshToken).toBe("real_refresh_token");
      expect(tokens?.expiresAt).toBeTruthy();

      const updated = await db.integrationRequirement.findUnique({ where: { id: requirement.id } });
      expect(updated?.connectionStatus).toBe("CONNECTED");
    });

    it("is single-use — the same state cannot be replayed", async () => {
      const { owner, project, requirement } = await seedProjectWithRequirement();
      const { authorizeUrl } = await beginOAuthConnection(
        owner.id,
        project.id,
        requirement.id,
        FAKE_PROVIDER,
      );
      const state = new URL(authorizeUrl).searchParams.get("state")!;
      mockTokenResponse({ access_token: "real_access_token" });

      await completeOAuthConnection(owner.id, state, "auth_code_123", FAKE_PROVIDER);

      await expect(
        completeOAuthConnection(owner.id, state, "auth_code_123", FAKE_PROVIDER),
      ).rejects.toBeInstanceOf(OAuthStateMismatchError);
    });

    it("rejects an unknown state", async () => {
      const { owner } = await seedProjectWithRequirement();

      await expect(
        completeOAuthConnection(owner.id, "never-issued-state", "code", FAKE_PROVIDER),
      ).rejects.toBeInstanceOf(OAuthStateMismatchError);
    });

    it("rejects an expired state, even though it exists", async () => {
      const { owner, project, requirement } = await seedProjectWithRequirement();
      const { authorizeUrl } = await beginOAuthConnection(
        owner.id,
        project.id,
        requirement.id,
        FAKE_PROVIDER,
      );
      const state = new URL(authorizeUrl).searchParams.get("state")!;
      await db.oAuthConnectionState.update({
        where: { state },
        data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
      });

      await expect(
        completeOAuthConnection(owner.id, state, "code", FAKE_PROVIDER),
      ).rejects.toBeInstanceOf(OAuthStateMismatchError);
    });

    it("rejects a callback from a different actor than the one who began the flow, without exchanging a token", async () => {
      const { owner, outsider, project, requirement } = await seedProjectWithRequirement();
      const { authorizeUrl } = await beginOAuthConnection(
        owner.id,
        project.id,
        requirement.id,
        FAKE_PROVIDER,
      );
      const state = new URL(authorizeUrl).searchParams.get("state")!;
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        completeOAuthConnection(outsider.id, state, "code", FAKE_PROVIDER),
      ).rejects.toBeInstanceOf(OAuthCallbackActorMismatchError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws OAuthTokenExchangeError on a failed exchange, without storing a credential or changing connection status", async () => {
      const { owner, project, requirement } = await seedProjectWithRequirement();
      const { authorizeUrl } = await beginOAuthConnection(
        owner.id,
        project.id,
        requirement.id,
        FAKE_PROVIDER,
      );
      const state = new URL(authorizeUrl).searchParams.get("state")!;
      mockTokenResponse({ error: "invalid_grant" }, false, 400);

      await expect(
        completeOAuthConnection(owner.id, state, "bad_code", FAKE_PROVIDER),
      ).rejects.toBeInstanceOf(OAuthTokenExchangeError);

      expect(await getConnectedTokenSet(owner.id, project.id, requirement.id)).toBeNull();
      const unchanged = await db.integrationRequirement.findUnique({
        where: { id: requirement.id },
      });
      expect(unchanged?.connectionStatus).toBe("SETUP_NEEDED");
    });

    it("throws OAuthTokenExchangeError when the response has no access_token", async () => {
      const { owner, project, requirement } = await seedProjectWithRequirement();
      const { authorizeUrl } = await beginOAuthConnection(
        owner.id,
        project.id,
        requirement.id,
        FAKE_PROVIDER,
      );
      const state = new URL(authorizeUrl).searchParams.get("state")!;
      mockTokenResponse({ token_type: "bearer" });

      await expect(
        completeOAuthConnection(owner.id, state, "code", FAKE_PROVIDER),
      ).rejects.toBeInstanceOf(OAuthTokenExchangeError);
    });
  });

  describe("deleteExpiredOAuthConnectionStates", () => {
    it("removes only states older than the expiry window, keeping recent ones", async () => {
      const { owner, project, requirement } = await seedProjectWithRequirement();
      await beginOAuthConnection(owner.id, project.id, requirement.id, FAKE_PROVIDER);
      const stale = await beginOAuthConnection(owner.id, project.id, requirement.id, FAKE_PROVIDER);
      const staleState = new URL(stale.authorizeUrl).searchParams.get("state")!;
      await db.oAuthConnectionState.update({
        where: { state: staleState },
        data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) },
      });

      const deletedCount = await deleteExpiredOAuthConnectionStates();

      expect(deletedCount).toBe(1);
      expect(await db.oAuthConnectionState.count({ where: { projectId: project.id } })).toBe(1);
    });
  });
});
