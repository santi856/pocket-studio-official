import "server-only";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenancy/platform-admin";
import type { IncidentReport, IncidentSeverity, IncidentStatus } from "@/generated/prisma/client";

export type ReportIncidentInput = {
  title: string;
  severity: IncidentSeverity;
  description: string;
  detectedAt: Date;
};

/**
 * Master Spec §31/§61 "incident response". Platform-wide, not
 * organization-scoped — requires real platform-admin access (P3-13,
 * src/lib/tenancy/platform-admin.ts): identifying and recording a real
 * platform incident is Pocket Studio's own internal administrative
 * operation, not a customer self-service one. No live monitoring/
 * alerting integration exists or is authorized here (no vendor named) —
 * an incident is recorded once a real operator has actually identified
 * one.
 */
export async function reportIncident(
  actorUserId: string,
  input: ReportIncidentInput,
): Promise<IncidentReport> {
  await requirePlatformAdmin(actorUserId);

  return db.incidentReport.create({
    data: {
      title: input.title,
      severity: input.severity,
      status: "OPEN",
      description: input.description,
      detectedAt: input.detectedAt,
      createdByUserId: actorUserId,
    },
  });
}

export class IncidentNotFoundError extends Error {
  constructor() {
    super("No such incident report exists.");
    this.name = "IncidentNotFoundError";
  }
}

export class InvalidIncidentTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot move an incident from ${from} to ${to}.`);
    this.name = "InvalidIncidentTransitionError";
  }
}

async function getIncident(incidentId: string): Promise<IncidentReport> {
  const incident = await db.incidentReport.findUnique({ where: { id: incidentId } });
  if (!incident) {
    throw new IncidentNotFoundError();
  }
  return incident;
}

export async function beginIncidentInvestigation(
  actorUserId: string,
  incidentId: string,
): Promise<IncidentReport> {
  await requirePlatformAdmin(actorUserId);

  const incident = await getIncident(incidentId);
  if (incident.status !== "OPEN") {
    throw new InvalidIncidentTransitionError(incident.status, "INVESTIGATING");
  }
  return db.incidentReport.update({
    where: { id: incident.id },
    data: { status: "INVESTIGATING" },
  });
}

/**
 * Resolving an incident always requires stating a real root cause and
 * remediation — an incident can never be silently closed with nothing
 * recorded about what happened or what was done about it.
 */
export async function resolveIncident(
  actorUserId: string,
  incidentId: string,
  input: { rootCause: string; remediation: string },
): Promise<IncidentReport> {
  await requirePlatformAdmin(actorUserId);

  const incident = await getIncident(incidentId);
  if (incident.status !== "INVESTIGATING") {
    throw new InvalidIncidentTransitionError(incident.status, "RESOLVED");
  }
  return db.incidentReport.update({
    where: { id: incident.id },
    data: {
      status: "RESOLVED",
      rootCause: input.rootCause,
      remediation: input.remediation,
      resolvedAt: new Date(),
    },
  });
}

export async function listIncidents(
  actorUserId: string,
  filter?: { status?: IncidentStatus },
): Promise<IncidentReport[]> {
  await requirePlatformAdmin(actorUserId);

  return db.incidentReport.findMany({
    where: { status: filter?.status },
    orderBy: { detectedAt: "desc" },
  });
}
