import { describe, expect, it } from "vitest";
import { findUnwiredButtonLabels } from "./quality-gate";
import type { ComponentNode } from "./component-registry";

describe("findUnwiredButtonLabels", () => {
  it("finds nothing when every Button is inside a Form", () => {
    const tree: ComponentNode = {
      type: "Screen",
      children: [
        {
          type: "Form",
          children: [
            { type: "Input", props: { name: "email" } },
            { type: "Button", props: { label: "Submit" } },
          ],
        },
      ],
    };

    expect(findUnwiredButtonLabels(tree)).toEqual([]);
  });

  it("flags a Button rendered outside any Form — the live preview route provides no onAction handler, so it would be a real, clickable dead click", () => {
    const tree: ComponentNode = {
      type: "Screen",
      children: [{ type: "Button", props: { label: "Book now" } }],
    };

    expect(findUnwiredButtonLabels(tree)).toEqual(["Book now"]);
  });

  it("does not false-positive on a Button that appears before its sibling Form in the tree", () => {
    // Card containing a decorative preview Button, followed by an unrelated
    // real Form elsewhere in the same screen — the decorative Button is
    // still outside any Form and must still be flagged.
    const tree: ComponentNode = {
      type: "Screen",
      children: [
        { type: "Card", children: [{ type: "Button", props: { label: "Preview" } }] },
        { type: "Form", children: [{ type: "Button", props: { label: "Submit" } }] },
      ],
    };

    expect(findUnwiredButtonLabels(tree)).toEqual(["Preview"]);
  });

  it("labels an unlabeled Button honestly rather than dropping it from the report", () => {
    const tree: ComponentNode = { type: "Button", props: {} };
    expect(findUnwiredButtonLabels(tree)).toEqual(["(unlabeled)"]);
  });

  it("finds nested unwired Buttons at any depth", () => {
    const tree: ComponentNode = {
      type: "Screen",
      children: [
        {
          type: "Stack",
          children: [
            {
              type: "Grid",
              children: [{ type: "Button", props: { label: "Deep button" } }],
            },
          ],
        },
      ],
    };

    expect(findUnwiredButtonLabels(tree)).toEqual(["Deep button"]);
  });
});
