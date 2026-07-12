import { z } from "zod";

/**
 * The closed set of UI primitives Pocket Studio's structured renderer
 * (P2-05) is permitted to interpret (Master Spec §26). Exactly the list
 * §26 names, in the same order — nothing added, nothing invented. Any
 * component type outside this set is, by definition, unsupported.
 */
export const COMPONENT_TYPES = [
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
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

export type ComponentCategory =
  "layout" | "typography" | "media" | "action" | "content" | "form" | "navigation" | "state";

/**
 * Categorization only, not a prop contract — per-component prop schemas are
 * a rendering concern for P2-05, not this registry. Useful for Build
 * Planner (P2-03) and future Blueprint generation to reason about which
 * primitives fill which structural role.
 */
export const COMPONENT_CATEGORIES: Record<ComponentType, ComponentCategory> = {
  Screen: "layout",
  Stack: "layout",
  Grid: "layout",
  Divider: "layout",
  Heading: "typography",
  Text: "typography",
  Image: "media",
  Icon: "media",
  Button: "action",
  Card: "content",
  List: "content",
  Badge: "content",
  Form: "form",
  Input: "form",
  Textarea: "form",
  Select: "form",
  Checkbox: "form",
  Radio: "form",
  Switch: "form",
  DatePicker: "form",
  TimePicker: "form",
  Tabs: "navigation",
  Modal: "navigation",
  Drawer: "navigation",
  BottomNavigation: "navigation",
  TopNavigation: "navigation",
  LoadingState: "state",
  EmptyState: "state",
  ErrorState: "state",
};

const COMPONENT_TYPE_SET: ReadonlySet<string> = new Set(COMPONENT_TYPES);

export function isSupportedComponentType(type: string): type is ComponentType {
  return COMPONENT_TYPE_SET.has(type);
}

export type ComponentNode = {
  type: ComponentType;
  props?: Record<string, unknown>;
  children?: ComponentNode[];
};

/**
 * Structural validation only (a node is an object with a `type` from the
 * closed set, optional `props`, optional recursive `children`) — not a
 * per-component prop contract. Backs `validateComponentTree`'s shape
 * checking; callers that need to accept arbitrary/untrusted input should
 * prefer `validateComponentTree`, which fails safely on unknown types
 * instead of throwing a Zod error.
 */
export const ComponentNodeSchema: z.ZodType<ComponentNode> = z.lazy(() =>
  z.object({
    type: z.enum(COMPONENT_TYPES),
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(ComponentNodeSchema).optional(),
  }),
);

export type RawComponentNode = {
  type: string;
  props?: Record<string, unknown>;
  children?: RawComponentNode[];
};

export type ComponentTreeValidationResult = {
  tree: ComponentNode;
  warnings: string[];
};

function fallbackNode(unsupportedType: string): ComponentNode {
  return {
    type: "ErrorState",
    props: { message: `Unsupported component: ${unsupportedType}` },
  };
}

/**
 * Master Spec §26: "Unknown components fail safely." Recursively walks a
 * raw, untrusted component tree — as will eventually arrive from Blueprint
 * screen definitions or a future AI provider — and replaces any node whose
 * `type` is outside the closed set with a safe `ErrorState` placeholder
 * instead of throwing and failing the whole render. Every substitution is
 * reported in `warnings` so it surfaces honestly rather than silently.
 */
export function validateComponentTree(
  raw: RawComponentNode,
  path = "root",
): ComponentTreeValidationResult {
  if (!isSupportedComponentType(raw.type)) {
    return {
      tree: fallbackNode(raw.type),
      warnings: [`Unknown component type "${raw.type}" at ${path} — replaced with ErrorState.`],
    };
  }

  const warnings: string[] = [];
  const children: ComponentNode[] = [];

  (raw.children ?? []).forEach((child, index) => {
    const result = validateComponentTree(child, `${path}.children[${index}]`);
    children.push(result.tree);
    warnings.push(...result.warnings);
  });

  return {
    tree: {
      type: raw.type,
      props: raw.props,
      children: children.length > 0 ? children : undefined,
    },
    warnings,
  };
}
