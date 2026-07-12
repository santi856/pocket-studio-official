import { describe, expect, it } from "vitest";
import { validateBlueprint } from "./blueprint-validation";

function validInput() {
  return {
    schemaVersion: "1.0",
    productType: "web_application",
    roles: ["customer"],
    screens: ["Home"],
    outputTargets: ["web"],
    dataModels: [{ name: "Record", fields: ["id"] }],
    requirements: [{ statement: "x" }],
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
});
