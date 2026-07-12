import { describe, expect, it } from "vitest";
import { diffDataModels } from "./migration-planning";

describe("diffDataModels", () => {
  it("classifies a new data model as added", () => {
    const diffs = diffDataModels([], [{ name: "Record", fields: ["id", "status"] }]);
    expect(diffs).toEqual([
      { modelName: "Record", status: "added", fieldsAdded: ["id", "status"], fieldsRemoved: [] },
    ]);
  });

  it("classifies a missing data model as removed", () => {
    const diffs = diffDataModels([{ name: "Record", fields: ["id", "status"] }], []);
    expect(diffs).toEqual([
      { modelName: "Record", status: "removed", fieldsAdded: [], fieldsRemoved: ["id", "status"] },
    ]);
  });

  it("classifies added and removed fields on the same data model as changed", () => {
    const diffs = diffDataModels(
      [{ name: "Record", fields: ["id", "status", "createdAt"] }],
      [{ name: "Record", fields: ["id", "status", "priority"] }],
    );
    expect(diffs).toEqual([
      {
        modelName: "Record",
        status: "changed",
        fieldsAdded: ["priority"],
        fieldsRemoved: ["createdAt"],
      },
    ]);
  });

  it("classifies an identical data model as unchanged", () => {
    const diffs = diffDataModels(
      [{ name: "Record", fields: ["id", "status"] }],
      [{ name: "Record", fields: ["id", "status"] }],
    );
    expect(diffs).toEqual([
      { modelName: "Record", status: "unchanged", fieldsAdded: [], fieldsRemoved: [] },
    ]);
  });
});
