// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
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

  const INCIDENT_INPUT = {
    title: "Elevated 5xx rate on /api/webhooks/stripe",
    severity: "HIGH" as const,
    description: "Webhook signature verification began failing for all requests.",
    detectedAt: new Date("2026-07-14T10:00:00Z"),
  };

  it("reports a new incident as OPEN", async () => {
    const incident = await reportIncident(INCIDENT_INPUT);

    expect(incident.status).toBe("OPEN");
    expect(incident.severity).toBe("HIGH");
  });

  it("moves OPEN -> INVESTIGATING -> RESOLVED, requiring a real root cause and remediation", async () => {
    const incident = await reportIncident(INCIDENT_INPUT);

    const investigating = await beginIncidentInvestigation(incident.id);
    expect(investigating.status).toBe("INVESTIGATING");

    const resolved = await resolveIncident(incident.id, {
      rootCause: "A dependency bump changed the webhook signing secret's expected encoding.",
      remediation: "Reverted the dependency bump and added a regression test.",
    });
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.rootCause).toContain("dependency");
    expect(resolved.remediation).toContain("Reverted");
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("rejects resolving an incident that has not begun investigation", async () => {
    const incident = await reportIncident(INCIDENT_INPUT);

    await expect(
      resolveIncident(incident.id, { rootCause: "x", remediation: "y" }),
    ).rejects.toBeInstanceOf(InvalidIncidentTransitionError);
  });

  it("rejects investigating an already-resolved incident", async () => {
    const incident = await reportIncident(INCIDENT_INPUT);
    await beginIncidentInvestigation(incident.id);
    await resolveIncident(incident.id, { rootCause: "x", remediation: "y" });

    await expect(beginIncidentInvestigation(incident.id)).rejects.toBeInstanceOf(
      InvalidIncidentTransitionError,
    );
  });

  it("throws IncidentNotFoundError for an unknown id", async () => {
    await expect(beginIncidentInvestigation("nonexistent-id")).rejects.toBeInstanceOf(
      IncidentNotFoundError,
    );
  });

  it("lists incidents, optionally filtered by status", async () => {
    const open = await reportIncident(INCIDENT_INPUT);
    const resolved = await reportIncident({ ...INCIDENT_INPUT, title: "A second incident" });
    await beginIncidentInvestigation(resolved.id);
    await resolveIncident(resolved.id, { rootCause: "x", remediation: "y" });

    const all = await listIncidents();
    expect(all).toHaveLength(2);

    const openOnly = await listIncidents({ status: "OPEN" });
    expect(openOnly.map((incident) => incident.id)).toEqual([open.id]);
  });
});
