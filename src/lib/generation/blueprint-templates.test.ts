import { describe, expect, it } from "vitest";
import { BLUEPRINT_CATEGORY_TEMPLATES } from "./blueprint-templates";

/**
 * Authoring-time invariant (Stage 3 D-0081, STAGE_2_ARCHITECTURE_PROPOSAL.md
 * §10.1): every `onScreen`/`triggersWorkflow` reference an action declares
 * must resolve to a real screen/workflow name declared *somewhere* in
 * BLUEPRINT_CATEGORY_TEMPLATES — not necessarily the same category entry,
 * since only the `workflows` category ever declares a workflow name and
 * most real pairings are legitimately cross-category. This is a pure,
 * deterministic, build-time check (a typo here is always a bug, never a
 * coverage question) — the separate, non-blocking question of whether a
 * *specific generation* actually matched the referenced category is handled
 * at runtime by the Graph Projector, not here.
 */
describe("BLUEPRINT_CATEGORY_TEMPLATES pairing invariants", () => {
  const declaredWorkflowNames = new Set(
    Object.values(BLUEPRINT_CATEGORY_TEMPLATES)
      .map((template) => template.workflow?.name)
      .filter((name): name is string => Boolean(name)),
  );

  const declaredScreenNames = new Set(
    Object.values(BLUEPRINT_CATEGORY_TEMPLATES).flatMap((template) => template.screens ?? []),
  );

  it("has at least one declared workflow name to validate against (sanity check on the test itself)", () => {
    expect(declaredWorkflowNames.size).toBeGreaterThan(0);
  });

  for (const [category, template] of Object.entries(BLUEPRINT_CATEGORY_TEMPLATES)) {
    for (const action of template.actions ?? []) {
      if (typeof action === "string") continue;

      if (action.triggersWorkflow !== undefined) {
        it(`"${category}" category's "${action.name}" action's triggersWorkflow ("${action.triggersWorkflow}") resolves to a real declared workflow name`, () => {
          expect(
            declaredWorkflowNames.has(action.triggersWorkflow!),
            `"${action.triggersWorkflow}" is not declared as any category's workflow.name — ` +
              `declared workflow names: ${[...declaredWorkflowNames].join(", ") || "(none)"}`,
          ).toBe(true);
        });
      }

      if (action.onScreen !== undefined) {
        it(`"${category}" category's "${action.name}" action's onScreen ("${action.onScreen}") resolves to a real declared screen name`, () => {
          expect(
            declaredScreenNames.has(action.onScreen!),
            `"${action.onScreen}" is not declared as any category's screens[] entry — ` +
              `declared screen names: ${[...declaredScreenNames].join(", ") || "(none)"}`,
          ).toBe(true);
        });
      }
    }
  }
});
