// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { assessFeasibility } from "./feasibility";

describe("assessFeasibility", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("reports a currently-supported capability as overall supported", async () => {
    const report = await assessFeasibility(["auth.email_password"]);

    expect(report.overallSupported).toBe(true);
    expect(report.unrecognizedCapabilityKeys).toEqual([]);
    expect(report.assessments[0]?.implementationLevel).toBe("SUPPORTED_NOW");
  });

  it("reports overallSupported false when any capability is deferred", async () => {
    const report = await assessFeasibility(["auth.email_password", "payments.deposits"]);

    expect(report.overallSupported).toBe(false);
    const deposits = report.assessments.find((a) => a.capabilityKey === "payments.deposits");
    expect(deposits?.implementationLevel).toBe("SUPPORTED_LATER_PHASE");
    expect(deposits?.limitations.length).toBeGreaterThan(0);
  });

  it("reports an unrecognized capability instead of assuming support", async () => {
    const report = await assessFeasibility(["some.made.up.capability"]);

    expect(report.unrecognizedCapabilityKeys).toEqual(["some.made.up.capability"]);
    expect(report.overallSupported).toBe(false);
  });

  it("flags external-approval-required capabilities as not currently available", async () => {
    const report = await assessFeasibility(["distribution.apple_google_submission"]);

    expect(report.assessments[0]?.implementationLevel).toBe("EXTERNAL_APPROVAL_REQUIRED");
    expect(report.overallSupported).toBe(false);
  });

  it("returns an empty, unsupported report for an empty request", async () => {
    const report = await assessFeasibility([]);
    expect(report.overallSupported).toBe(false);
    expect(report.assessments).toEqual([]);
  });
});
