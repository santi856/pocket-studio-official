import { describe, expect, it } from "vitest";
import {
  COMPONENT_CATEGORIES,
  COMPONENT_TYPES,
  ComponentNodeSchema,
  isSupportedComponentType,
  validateComponentTree,
} from "./component-registry";

describe("COMPONENT_TYPES", () => {
  it("matches the exact Master Spec §26 primitive list, in order", () => {
    expect(COMPONENT_TYPES).toEqual([
      "Screen",
      "Stack",
      "Grid",
      "Heading",
      "Text",
      "Image",
      "Icon",
      "Button",
      "Card",
      "List",
      "Form",
      "Input",
      "Textarea",
      "Select",
      "Checkbox",
      "Radio",
      "Switch",
      "DatePicker",
      "TimePicker",
      "Badge",
      "Tabs",
      "Modal",
      "Drawer",
      "BottomNavigation",
      "TopNavigation",
      "Divider",
      "LoadingState",
      "EmptyState",
      "ErrorState",
    ]);
  });

  it("has a category for every component type and no extras", () => {
    expect(Object.keys(COMPONENT_CATEGORIES).sort()).toEqual([...COMPONENT_TYPES].sort());
  });
});

describe("isSupportedComponentType", () => {
  it("accepts every type in the registry", () => {
    for (const type of COMPONENT_TYPES) {
      expect(isSupportedComponentType(type)).toBe(true);
    }
  });

  it("rejects an unrecognized type", () => {
    expect(isSupportedComponentType("VideoPlayer")).toBe(false);
    expect(isSupportedComponentType("")).toBe(false);
  });
});

describe("ComponentNodeSchema", () => {
  it("parses a valid recursive tree", () => {
    const result = ComponentNodeSchema.safeParse({
      type: "Screen",
      props: { title: "Home" },
      children: [{ type: "Text", props: { value: "Hello" } }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a node whose type is outside the closed set", () => {
    const result = ComponentNodeSchema.safeParse({ type: "VideoPlayer" });
    expect(result.success).toBe(false);
  });
});

describe("validateComponentTree", () => {
  it("passes a fully supported tree through unchanged with no warnings", () => {
    const result = validateComponentTree({
      type: "Screen",
      props: { title: "Home" },
      children: [
        { type: "Heading", props: { text: "Welcome" } },
        { type: "Button", props: { label: "Continue" } },
      ],
    });

    expect(result.warnings).toEqual([]);
    expect(result.tree.type).toBe("Screen");
    expect(result.tree.children).toHaveLength(2);
  });

  it("replaces an unknown top-level component with ErrorState and reports why", () => {
    const result = validateComponentTree({ type: "VideoPlayer" });

    expect(result.tree.type).toBe("ErrorState");
    expect(result.tree.props?.message).toContain("VideoPlayer");
    expect(result.warnings).toEqual([
      'Unknown component type "VideoPlayer" at root — replaced with ErrorState.',
    ]);
  });

  it("replaces an unknown nested component without discarding its supported siblings", () => {
    const result = validateComponentTree({
      type: "Screen",
      children: [{ type: "Heading", props: { text: "Welcome" } }, { type: "Carousel" }],
    });

    expect(result.tree.children).toHaveLength(2);
    expect(result.tree.children?.[0]?.type).toBe("Heading");
    expect(result.tree.children?.[1]?.type).toBe("ErrorState");
    expect(result.warnings).toEqual([
      'Unknown component type "Carousel" at root.children[1] — replaced with ErrorState.',
    ]);
  });

  it("collects a distinct warning per unsupported node across multiple levels", () => {
    const result = validateComponentTree({
      type: "Screen",
      children: [
        {
          type: "Stack",
          children: [{ type: "Sparkline" }],
        },
        { type: "MapView" },
      ],
    });

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("root.children[0].children[0]");
    expect(result.warnings[1]).toContain("root.children[1]");
  });

  it("omits an empty children array rather than keeping an empty list", () => {
    const result = validateComponentTree({ type: "Divider" });
    expect(result.tree.children).toBeUndefined();
  });
});
