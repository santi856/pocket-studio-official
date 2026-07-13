// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { INITIAL_CAPABILITIES, seedCapabilityRegistry } from "./seed-data";
import { listLatestCapabilities } from "./capability-registry";

describe("seedCapabilityRegistry", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("has no duplicate capability keys in the seed data itself", () => {
    const keys = INITIAL_CAPABILITIES.map((c) => c.capabilityKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("inserts one version-1 entry per capability", async () => {
    await seedCapabilityRegistry();

    const entries = await listLatestCapabilities();
    expect(entries).toHaveLength(INITIAL_CAPABILITIES.length);
    expect(entries.every((entry) => entry.version === 1)).toBe(true);
  });

  it("is idempotent-safe to call again (creates version 2, does not error or duplicate keys)", async () => {
    await seedCapabilityRegistry();
    await seedCapabilityRegistry();

    const entries = await listLatestCapabilities();
    expect(entries).toHaveLength(INITIAL_CAPABILITIES.length);
    expect(entries.every((entry) => entry.version === 2)).toBe(true);
  });

  it("registers generation.full_stack_web_app as SUPPORTED_NOW, not stale SUPPORTED_LATER_PHASE, now that Phase 2 ships it (P2-EXIT)", async () => {
    await seedCapabilityRegistry();

    const entries = await listLatestCapabilities();
    const webApp = entries.find((entry) => entry.capabilityKey === "generation.full_stack_web_app");
    expect(webApp?.implementationLevel).toBe("SUPPORTED_NOW");
  });

  it("registers the Example App Ideas picker (AS-0001's first vertical proof) as a real, SUPPORTED_NOW platform capability", async () => {
    await seedCapabilityRegistry();

    const entries = await listLatestCapabilities();
    const picker = entries.find(
      (entry) => entry.capabilityKey === "studio.example_app_ideas_picker",
    );
    expect(picker?.implementationLevel).toBe("SUPPORTED_NOW");
    expect(picker?.riskClass).toBe("LOW");
  });
});
