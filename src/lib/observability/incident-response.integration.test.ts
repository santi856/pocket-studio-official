// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { grantPlatformAdmin } from "@/lib/tenancy/platform-admin";
import {
  IncidentNotFoundError,
  InvalidIncidentTransitionError,
  beginIncidentInvestigation,
  listIncidents,
  reportIncident,
  resolveIncident,
} from "./incident-response";

describe("incident response", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedAdmin() {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);
    return admin;
  }

  const INCIDENT_INPUT = {
    title: "Elevated 5xx rate on /api/webhooks/stripe",
    severity: "HIGH" as const,
    description: "Webhook signature verification began failing for all requests.",
    detectedAt: new Date("2026-07-14T10:00:00Z"),
  };

  it("reports a new incident as OPEN", async () => {
    const admin = await seedAdmin();

    const incident = await reportIncident(admin.id, INCIDENT_INPUT);

    expect(incident.status).toBe("OPEN");
    expect(incident.severity).toBe("HIGH");
  });

  it("denies reporting an incident to a non-admin", async () => {
    const nonAdmin = await registerUser({ email: "nonadmin@example.com", password: "password123" });

    await expect(reportIncident(nonAdmin.id, INCIDENT_INPUT)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("moves OPEN -> INVESTIGATING -> RESOLVED, requiring a real root cause and remediation", async () => {
    const admin = await seedAdmin();
    const incident = await reportIncident(admin.id, INCIDENT_INPUT);

    const investigating = await beginIncidentInvestigation(admin.id, incident.id);
    expect(investigating.status).toBe("INVESTIGATING");

    const resolved = await resolveIncident(admin.id, incident.id, {
      rootCause: "A dependency bump changed the webhook signing secret's expected encoding.",
      remediation: "Reverted the dependency bump and added a regression test.",
    });
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.rootCause).toContain("dependency");
    expect(resolved.remediation).toContain("Reverted");
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("rejects resolving an incident that has not begun investigation", async () => {
    const admin = await seedAdmin();
    const incident = await reportIncident(admin.id, INCIDENT_INPUT);

    await expect(
      resolveIncident(admin.id, incident.id, { rootCause: "x", remediation: "y" }),
    ).rejects.toBeInstanceOf(InvalidIncidentTransitionError);
  });

  it("rejects investigating an already-resolved incident", async () => {
    const admin = await seedAdmin();
    const incident = await reportIncident(admin.id, INCIDENT_INPUT);
    await beginIncidentInvestigation(admin.id, incident.id);
    await resolveIncident(admin.id, incident.id, { rootCause: "x", remediation: "y" });

    await expect(beginIncidentInvestigation(admin.id, incident.id)).rejects.toBeInstanceOf(
      InvalidIncidentTransitionError,
    );
  });

  it("throws IncidentNotFoundError for an unknown id", async () => {
    const admin = await seedAdmin();

    await expect(beginIncidentInvestigation(admin.id, "nonexistent-id")).rejects.toBeInstanceOf(
      IncidentNotFoundError,
    );
  });

  it("lists incidents, optionally filtered by status, denying a non-admin", async () => {
    const admin = await seedAdmin();
    const open = await reportIncident(admin.id, INCIDENT_INPUT);
    const resolved = await reportIncident(admin.id, {
      ...INCIDENT_INPUT,
      title: "A second incident",
    });
    await beginIncidentInvestigation(admin.id, resolved.id);
    await resolveIncident(admin.id, resolved.id, { rootCause: "x", remediation: "y" });

    const all = await listIncidents(admin.id);
    expect(all).toHaveLength(2);

    const openOnly = await listIncidents(admin.id, { status: "OPEN" });
    expect(openOnly.map((incident) => incident.id)).toEqual([open.id]);

    const nonAdmin = await registerUser({ email: "nonadmin@example.com", password: "password123" });
    await expect(listIncidents(nonAdmin.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
