import { describe, expect, it } from "vitest";
import { validateBlueprint } from "./blueprint-validation";
import { inferScreenPatterns, inferWorkflowPatterns } from "./interaction-contracts";
import type { InteractionContractMap } from "./interaction-contracts";

function validInput() {
  return {
    schemaVersion: "1.0",
    productType: "web_application",
    roles: ["customer"],
    screens: ["Home"],
    outputTargets: ["web"],
    dataModels: [{ name: "Record", fields: ["id"] }],
    requirements: [{ statement: "x" }],
    workflows: [] as Array<{ name: string }>,
    interactionContracts: {
      Home: inferScreenPatterns("Home", [], "idea"),
    } as InteractionContractMap,
  };
}

describe("validateBlueprint", () => {
  it("accepts a structurally complete Blueprint", () => {
    const result = validateBlueprint(validInput());
    expect(result).toEqual({ status: "VALID", errors: [] });
  });

  it("rejects a missing schemaVersion", () => {
    const result = validateBlueprint({ ...validInput(), schemaVersion: "" });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain("schemaVersion is required.");
  });

  it("rejects a missing productType", () => {
    const result = validateBlueprint({ ...validInput(), productType: null });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain("productType is required.");
  });

  it("rejects zero roles", () => {
    const result = validateBlueprint({ ...validInput(), roles: [] });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain("At least one role is required.");
  });

  it("rejects zero screens", () => {
    const result = validateBlueprint({ ...validInput(), screens: [] });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain("At least one screen is required.");
  });

  it("rejects zero requirements", () => {
    const result = validateBlueprint({ ...validInput(), requirements: [] });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain("At least one requirement is required.");
  });

  it("rejects zero output targets", () => {
    const result = validateBlueprint({ ...validInput(), outputTargets: [] });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain("At least one output target is required.");
  });

  it("rejects an output target that is not currently supported for generation", () => {
    const result = validateBlueprint({ ...validInput(), outputTargets: ["ios"] });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain(
      'Output target "ios" is not currently supported for generation.',
    );
  });

  it("rejects a data model with no fields", () => {
    const result = validateBlueprint({
      ...validInput(),
      dataModels: [{ name: "Empty", fields: [] }],
    });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain('Data model "Empty" must have a name and at least one field.');
  });

  it("collects every violated rule at once rather than stopping at the first", () => {
    const result = validateBlueprint({
      ...validInput(),
      roles: [],
      screens: [],
      requirements: [],
    });
    expect(result.errors).toHaveLength(3);
  });

  // P2-EXIT hardening: interaction contracts can no longer be silently
  // omitted — a screen or workflow present in the Blueprint but absent
  // from interactionContracts now makes the whole Blueprint INVALID,
  // where previously an omitted `interactionContracts` field (undefined)
  // simply skipped the check entirely.
  it("rejects a screen with no interaction contract at all", () => {
    const result = validateBlueprint({ ...validInput(), interactionContracts: {} });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain('"Home" has no interaction contract.');
  });

  it("rejects a workflow with no interaction contract, not just screens", () => {
    const input = validInput();
    const result = validateBlueprint({
      ...input,
      workflows: [{ name: "Primary Workflow" }],
      // interactionContracts still only covers the screen, not the workflow.
    });
    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain('"workflow:Primary Workflow" has no interaction contract.');
  });

  it("accepts a Blueprint whose workflow also has a well-formed interaction contract", () => {
    const input = validInput();
    const result = validateBlueprint({
      ...input,
      workflows: [{ name: "Primary Workflow" }],
      interactionContracts: {
        ...input.interactionContracts,
        "workflow:Primary Workflow": inferWorkflowPatterns([], "idea"),
      },
    });
    expect(result).toEqual({ status: "VALID", errors: [] });
  });
});
