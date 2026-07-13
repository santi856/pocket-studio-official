// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateInitialBlueprint } from "./blueprint-generator";
import { generateBuildPlan } from "./build-planner";
import { getLatestTruthStatus } from "@/lib/product/truth-status";
import { listEvidence } from "@/lib/product/evidence";
import { listEvents } from "@/lib/product/events";
import { NoGenerationToCheckError, runQualityGate } from "./quality-gate";

describe("runQualityGate", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    return { owner, project };
  }

  it("throws NoGenerationToCheckError when the project has no Blueprint or Build Plan yet", async () => {
    const { owner, project } = await seedProject();

    await expect(runQualityGate(owner.id, project.id)).rejects.toBeInstanceOf(
      NoGenerationToCheckError,
    );
  });

  it("passes every check for a clean, data-bound generation and records evidence + Truth Status", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    await generateBuildPlan(owner.id, project.id);

    const result = await runQualityGate(owner.id, project.id);

    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
    expect(result.checks.map((check) => check.name)).toContain(
      "List-view screens are wired to a real data dependency",
    );

    const status = await getLatestTruthStatus(owner.id, project.id, "quality.gate");
    expect(status?.status).toBe("IMPLEMENTED");

    const evidence = await listEvidence(owner.id, project.id, { subjectKey: "quality.gate" });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.result).toContain("pass");

    const events = await listEvents(owner.id, project.id, { type: "QUALITY_GATE_RUN" });
    expect(events).toHaveLength(1);
  });

  it("fails, and syncs Truth Status to BLOCKED, when the Build Plan has real blockers", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    await generateBuildPlan(owner.id, project.id);

    const result = await runQualityGate(owner.id, project.id);

    expect(result.passed).toBe(false);
    const buildPlanCheck = result.checks.find(
      (c) => c.name === "Build Plan has no unresolved blockers",
    );
    expect(buildPlanCheck?.passed).toBe(false);

    const status = await getLatestTruthStatus(owner.id, project.id, "quality.gate");
    expect(status?.status).toBe("BLOCKED");
  });

  it("catches a Form Input whose name does not match its bound data model's real fields", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    const plan = await generateBuildPlan(owner.id, project.id);

    // Corrupt the stored Build Plan's Checkout Form to name an Input after
    // a field the bound "Payment" data model does not have — the same
    // defect class the P2-07 fix prevents at generation time; this
    // confirms the Quality Gate would independently catch it if it ever
    // recurred (e.g. from a future generator change).
    const componentStructure = plan.componentStructure as Record<string, unknown>;
    const checkout = componentStructure["Checkout"] as { children?: unknown[] };
    const form = checkout.children?.find(
      (
        child,
      ): child is {
        type: string;
        children?: Array<{ type: string; props?: Record<string, unknown> }>;
      } => (child as { type?: string }).type === "Form",
    );
    const input = form?.children?.find((child) => child.type === "Input");
    if (input) {
      input.props = { name: "totallyUnknownField" };
    }
    await db.buildPlan.update({
      where: { id: plan.id },
      data: { componentStructure: componentStructure as never },
    });

    const result = await runQualityGate(owner.id, project.id);

    const formCheck = result.checks.find(
      (c) => c.name === "Form-submission screens' Inputs match their bound data model's fields",
    );
    expect(formCheck?.passed).toBe(false);
    expect(formCheck?.details).toContain("totallyUnknownField");
    expect(result.passed).toBe(false);
  });

  it("marks every real quality dimension IMPLEMENTED for a clean generation, not just the flat rollup (P2-EXIT)", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    await generateBuildPlan(owner.id, project.id);

    await runQualityGate(owner.id, project.id);

    for (const dimension of [
      "structural",
      "behavioral",
      "accessibility",
      "governance",
      "operational",
    ]) {
      const status = await getLatestTruthStatus(owner.id, project.id, `quality.${dimension}`);
      expect(status?.status).toBe("IMPLEMENTED");
    }
  });

  it("records independent Truth Status per quality dimension — a missing alt tag blocks only quality.accessibility, not structural or behavioral (P2-EXIT)", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    const plan = await generateBuildPlan(owner.id, project.id);

    // buildComponentTree never generates an Image node deterministically —
    // inject one with no alt text to exercise the one real accessibility
    // check that exists, the same corruption discipline as every other
    // Quality Gate regression test in this file.
    const componentStructure = plan.componentStructure as Record<string, { children?: unknown[] }>;
    const [firstScreen] = Object.keys(componentStructure);
    componentStructure[firstScreen!]!.children = [
      ...(componentStructure[firstScreen!]!.children ?? []),
      { type: "Image", props: {} },
    ];
    await db.buildPlan.update({
      where: { id: plan.id },
      data: { componentStructure: componentStructure as never },
    });

    const result = await runQualityGate(owner.id, project.id);
    expect(result.passed).toBe(false);

    const accessibility = await getLatestTruthStatus(owner.id, project.id, "quality.accessibility");
    expect(accessibility?.status).toBe("BLOCKED");

    // A defect in one dimension must never collapse another, real dimension
    // into a false BLOCKED — that would be exactly the "one misleading
    // status" failure mode this split exists to prevent.
    const structural = await getLatestTruthStatus(owner.id, project.id, "quality.structural");
    expect(structural?.status).toBe("IMPLEMENTED");
    const behavioral = await getLatestTruthStatus(owner.id, project.id, "quality.behavioral");
    expect(behavioral?.status).toBe("IMPLEMENTED");
    const governance = await getLatestTruthStatus(owner.id, project.id, "quality.governance");
    expect(governance?.status).toBe("IMPLEMENTED");
  });

  it("passes a real, uncorrupted non-monetization multi-step-workflow product — unresolved states are disclosed, never falsely flagged unsupported (regression, Level 3 review round 1 finding)", async () => {
    // Independent review of the practical-completeness repair found this
    // exact scenario live-reproduced a false BLOCKED verdict:
    // computeUnsupportedStates only excluded consequential_decision states
    // from its "renderer must implement this" check, not unresolved ones —
    // and every non-monetization multi-step-workflow carries an unresolved
    // "confirmation" state by design (interaction-contracts.ts). This idea
    // triggers both the "data" category (so Home/Browse are genuinely
    // data-bound, keeping the *other*, unrelated list-view-binding check
    // honestly green) and the "workflows" category ("step by step") without
    // triggering "monetization" — producing exactly the unresolved-state
    // case through the real, uncorrupted pipeline, not a synthetic
    // contract.
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build an app with a database of customer records that guides a customer step by step through booking an appointment.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    await generateBuildPlan(owner.id, project.id);

    const result = await runQualityGate(owner.id, project.id);

    const unsupportedCheck = result.checks.find(
      (c) =>
        c.name === "Every required interaction state is implementable by this build's renderer",
    );
    expect(unsupportedCheck?.passed).toBe(true);
    expect(result.passed).toBe(true);

    const behavioral = await getLatestTruthStatus(owner.id, project.id, "quality.behavioral");
    expect(behavioral?.status).toBe("IMPLEMENTED");
  });

  it("catches a required interaction state this build's renderer cannot actually implement (P2-EXIT check)", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records.",
    );
    const blueprint = await generateInitialBlueprint(owner.id, project.id);
    await generateBuildPlan(owner.id, project.id);

    // Corrupt the stored Blueprint's real interaction contract to claim a
    // required state this build's renderer does not implement — proves the
    // check reacts to a real capability gap rather than trusting the
    // contract was computed correctly, the same discipline as the sibling
    // Form-Input-mismatch test above.
    const contracts = blueprint.interactionContracts as Record<
      string,
      { unsupportedStates?: string[] }
    >;
    const [firstScreen] = Object.keys(contracts);
    contracts[firstScreen!]!.unsupportedStates = ["retry"];
    await db.blueprint.update({
      where: { id: blueprint.id },
      data: { interactionContracts: contracts as never },
    });

    const result = await runQualityGate(owner.id, project.id);

    const unsupportedCheck = result.checks.find(
      (c) =>
        c.name === "Every required interaction state is implementable by this build's renderer",
    );
    expect(unsupportedCheck?.passed).toBe(false);
    expect(unsupportedCheck?.details).toContain("retry");
    expect(result.passed).toBe(false);
  });

  it("catches a consequential interaction state that was never actually disclosed in openDecisions (P2-EXIT check)", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits.",
    );
    const blueprint = await generateInitialBlueprint(owner.id, project.id);
    await generateBuildPlan(owner.id, project.id);

    // This idea's Checkout screen has a real consequential "confirmation"
    // state, disclosed in openDecisions by blueprint-generator.ts's own
    // loop. Strip that disclosure to prove the Quality Gate independently
    // re-verifies it happened, rather than trusting it structurally.
    const originalOpenDecisions = blueprint.openDecisions as string[];
    const strippedOpenDecisions = originalOpenDecisions.filter(
      (decision) => !decision.includes("consequential decision"),
    );
    expect(strippedOpenDecisions.length).toBeLessThan(originalOpenDecisions.length);
    await db.blueprint.update({
      where: { id: blueprint.id },
      data: { openDecisions: strippedOpenDecisions },
    });

    const result = await runQualityGate(owner.id, project.id);

    const disclosureCheck = result.checks.find(
      (c) =>
        c.name ===
        "Consequential and unresolved interaction states are disclosed, never silently decided",
    );
    expect(disclosureCheck?.passed).toBe(false);
    expect(disclosureCheck?.details).toContain("consequential");
    expect(result.passed).toBe(false);
  });

  it("catches a Button rendered outside any Form — a real dead click on the live preview route (P2-EXIT check)", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);
    const plan = await generateBuildPlan(owner.id, project.id);

    const componentStructure = plan.componentStructure as Record<string, { children?: unknown[] }>;
    const [firstScreen] = Object.keys(componentStructure);
    componentStructure[firstScreen!]!.children = [
      ...(componentStructure[firstScreen!]!.children ?? []),
      { type: "Button", props: { label: "Decorative button" } },
    ];
    await db.buildPlan.update({
      where: { id: plan.id },
      data: { componentStructure: componentStructure as never },
    });

    const result = await runQualityGate(owner.id, project.id);

    const unwiredCheck = result.checks.find(
      (c) =>
        c.name ===
        "Every Button is wired to a real action (inside a Form, or a real onAction handler)",
    );
    expect(unwiredCheck?.passed).toBe(false);
    expect(unwiredCheck?.details).toContain("Decorative button");
    expect(result.passed).toBe(false);
  });

  it("denies running the Quality Gate for an actor without project access", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);
    await generateBuildPlan(owner.id, project.id);
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(runQualityGate(outsider.id, project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
