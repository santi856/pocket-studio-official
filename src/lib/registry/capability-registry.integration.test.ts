// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import {
  getLatestCapability,
  listLatestCapabilities,
  upsertCapabilityVersion,
} from "./capability-registry";

describe("Capability Registry versioning", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("creates version 1 on first write", async () => {
    const entry = await upsertCapabilityVersion({
      capabilityKey: "auth.email_password",
      label: "Email and password authentication",
      category: "platform",
      implementationLevel: "SUPPORTED_NOW",
      riskClass: "LOW",
    });

    expect(entry.version).toBe(1);
  });

  it("increments the version for the same capabilityKey and getLatestCapability returns the newest", async () => {
    await upsertCapabilityVersion({
      capabilityKey: "payments.deposits",
      label: "Deposits (draft)",
      category: "monetization",
      implementationLevel: "PLANNING_ONLY",
      riskClass: "HIGH",
    });
    await upsertCapabilityVersion({
      capabilityKey: "payments.deposits",
      label: "Deposits",
      category: "monetization",
      implementationLevel: "SUPPORTED_LATER_PHASE",
      riskClass: "HIGH",
    });

    const latest = await getLatestCapability("payments.deposits");
    expect(latest?.version).toBe(2);
    expect(latest?.implementationLevel).toBe("SUPPORTED_LATER_PHASE");
  });

  it("returns null for an unknown capability key", async () => {
    expect(await getLatestCapability("nonexistent.capability")).toBeNull();
  });

  it("listLatestCapabilities returns only the newest version per key", async () => {
    await upsertCapabilityVersion({
      capabilityKey: "auth.email_password",
      label: "v1",
      category: "platform",
      implementationLevel: "SUPPORTED_NOW",
      riskClass: "LOW",
    });
    await upsertCapabilityVersion({
      capabilityKey: "auth.email_password",
      label: "v2",
      category: "platform",
      implementationLevel: "SUPPORTED_NOW",
      riskClass: "LOW",
    });
    await upsertCapabilityVersion({
      capabilityKey: "payments.deposits",
      label: "deposits",
      category: "monetization",
      implementationLevel: "SUPPORTED_LATER_PHASE",
      riskClass: "HIGH",
    });

    const latest = await listLatestCapabilities();
    expect(latest).toHaveLength(2);
    const auth = latest.find((entry) => entry.capabilityKey === "auth.email_password");
    expect(auth?.label).toBe("v2");
  });

  it("filters listLatestCapabilities by category", async () => {
    await upsertCapabilityVersion({
      capabilityKey: "auth.email_password",
      label: "auth",
      category: "platform",
      implementationLevel: "SUPPORTED_NOW",
      riskClass: "LOW",
    });
    await upsertCapabilityVersion({
      capabilityKey: "payments.deposits",
      label: "deposits",
      category: "monetization",
      implementationLevel: "SUPPORTED_LATER_PHASE",
      riskClass: "HIGH",
    });

    const monetizationOnly = await listLatestCapabilities({ category: "monetization" });
    expect(monetizationOnly).toHaveLength(1);
    expect(monetizationOnly[0]?.capabilityKey).toBe("payments.deposits");
  });
});
