"use client";

import { createContext, useContext, useState } from "react";
import type { ComponentNode } from "@/lib/generation/component-registry";

/**
 * Structured Renderer + Interactive Runtime (Master Spec §25, §26). Real,
 * working UI interpreted at render time from a Build Plan's
 * `componentStructure` — a validated `ComponentNode` tree using only
 * Component Registry (P2-02) primitives — never a hardcoded preview
 * screen. Every primitive below is a real, interactive DOM element: typing
 * in an Input is real browser text input, clicking a Button fires a real
 * callback, submitting a Form performs a real native form action (React's
 * `<form action={fn}>`, the same pattern every Server-Action-backed form in
 * this codebase already uses — see src/app/sign-up/page.tsx).
 *
 * This module renders a tree; it does not decide *what* tree to render for
 * a given data state (loading/empty/error/success) — that binding lives in
 * src/lib/generation/screen-data-binding.ts, kept separate so it can be
 * unit-tested without a DOM. Wiring this renderer to a live, customer-
 * facing route is P2-06 (full-stack generation orchestration) — this unit
 * proves the renderer and its data binding are real and correct, not that
 * a generated application is deployed.
 */

export type FormAction = (formData: FormData) => void | Promise<void>;
export type ActionHandler = (label: string) => void;

export type ComponentRendererProps = {
  node: ComponentNode;
  action?: FormAction;
  onAction?: ActionHandler;
};

const FormContext = createContext(false);

function fieldName(node: ComponentNode, fallback: string): string {
  const name = node.props?.name;
  return typeof name === "string" && name.length > 0 ? name : fallback;
}

function textProp(node: ComponentNode, ...keys: string[]): string {
  for (const key of keys) {
    const value = node.props?.[key];
    if (typeof value === "string") return value;
  }
  return "";
}

export function ComponentRenderer({ node, action, onAction }: ComponentRendererProps) {
  const children = node.children ?? [];
  const renderChildren = () =>
    children.map((child, index) => (
      <ComponentRenderer key={index} node={child} action={action} onAction={onAction} />
    ));

  switch (node.type) {
    case "Screen":
      return (
        <div data-component="Screen" data-screen={textProp(node, "name")}>
          {renderChildren()}
        </div>
      );
    case "Stack":
      return (
        <div data-component="Stack" className="flex flex-col gap-2">
          {renderChildren()}
        </div>
      );
    case "Grid":
      return (
        <div data-component="Grid" className="grid grid-cols-2 gap-2">
          {renderChildren()}
        </div>
      );
    case "Heading":
      return <h2 data-component="Heading">{textProp(node, "text")}</h2>;
    case "Text":
      return <p data-component="Text">{textProp(node, "value", "text")}</p>;
    case "Image":
      // eslint-disable-next-line @next/next/no-img-element -- generated content, not a known-optimizable static asset
      return <img data-component="Image" src={textProp(node, "src")} alt={textProp(node, "alt")} />;
    case "Icon":
      return (
        <span data-component="Icon" aria-hidden="true">
          {textProp(node, "name")}
        </span>
      );
    case "Button":
      return <ButtonNode node={node} onAction={onAction} />;
    case "Card":
      return (
        <div data-component="Card" className="rounded border p-4">
          {renderChildren()}
        </div>
      );
    case "List":
      return <ListNode node={node} />;
    case "Form":
      return <FormNode node={node} action={action} onAction={onAction} />;
    case "Input":
      return (
        <input
          data-component="Input"
          name={fieldName(node, "input")}
          defaultValue={textProp(node, "defaultValue")}
          placeholder={textProp(node, "placeholder")}
        />
      );
    case "Textarea":
      return (
        <textarea
          data-component="Textarea"
          name={fieldName(node, "textarea")}
          defaultValue={textProp(node, "defaultValue")}
        />
      );
    case "Select": {
      const options = Array.isArray(node.props?.options)
        ? (node.props?.options as unknown[]).filter((o): o is string => typeof o === "string")
        : [];
      return (
        <select data-component="Select" name={fieldName(node, "select")}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    case "Checkbox":
      return <input data-component="Checkbox" type="checkbox" name={fieldName(node, "checkbox")} />;
    case "Radio":
      return <input data-component="Radio" type="radio" name={fieldName(node, "radio")} />;
    case "Switch":
      return (
        <input
          data-component="Switch"
          type="checkbox"
          role="switch"
          name={fieldName(node, "switch")}
        />
      );
    case "DatePicker":
      return <input data-component="DatePicker" type="date" name={fieldName(node, "date")} />;
    case "TimePicker":
      return <input data-component="TimePicker" type="time" name={fieldName(node, "time")} />;
    case "Badge":
      return (
        <span data-component="Badge" className="rounded-full px-2 py-0.5 text-xs">
          {textProp(node, "label")}
        </span>
      );
    case "Tabs":
      return <TabsNode node={node} action={action} onAction={onAction} />;
    case "Modal":
      return <DisclosureNode node={node} action={action} onAction={onAction} kind="Modal" />;
    case "Drawer":
      return <DisclosureNode node={node} action={action} onAction={onAction} kind="Drawer" />;
    case "BottomNavigation":
    case "TopNavigation":
      return <NavigationNode node={node} onAction={onAction} />;
    case "Divider":
      return <hr data-component="Divider" />;
    case "LoadingState":
      return (
        <p data-component="LoadingState" role="status">
          {textProp(node, "message") || "Loading…"}
        </p>
      );
    case "EmptyState":
      return <p data-component="EmptyState">{textProp(node, "message") || "Nothing here yet."}</p>;
    case "ErrorState":
      return (
        <p data-component="ErrorState" role="alert">
          {textProp(node, "message") || "Something went wrong."}
        </p>
      );
  }
}

function ButtonNode({ node, onAction }: { node: ComponentNode; onAction?: ActionHandler }) {
  const insideForm = useContext(FormContext);
  const label = textProp(node, "label") || "Button";
  if (insideForm) {
    return (
      <button data-component="Button" type="submit">
        {label}
      </button>
    );
  }
  return (
    <button data-component="Button" type="button" onClick={() => onAction?.(label)}>
      {label}
    </button>
  );
}

function ListNode({ node }: { node: ComponentNode }) {
  const items = Array.isArray(node.props?.items) ? (node.props?.items as unknown[]) : [];
  if (items.length === 0) {
    return (
      <p data-component="List" data-state="empty">
        No items.
      </p>
    );
  }
  return (
    <ul data-component="List">
      {items.map((item, index) => (
        <li key={index}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
      ))}
    </ul>
  );
}

function FormNode({
  node,
  action,
  onAction,
}: {
  node: ComponentNode;
  action?: FormAction;
  onAction?: ActionHandler;
}) {
  return (
    <FormContext.Provider value={true}>
      <form data-component="Form" action={action}>
        {(node.children ?? []).map((child, index) => (
          <ComponentRenderer key={index} node={child} action={action} onAction={onAction} />
        ))}
      </form>
    </FormContext.Provider>
  );
}

function TabsNode({
  node,
  action,
  onAction,
}: {
  node: ComponentNode;
  action?: FormAction;
  onAction?: ActionHandler;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabs = node.children ?? [];
  const active = tabs[activeIndex];

  return (
    <div data-component="Tabs">
      <div role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={index}
            role="tab"
            type="button"
            aria-selected={index === activeIndex}
            onClick={() => setActiveIndex(index)}
          >
            {textProp(tab, "label") || `Tab ${index + 1}`}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {active && <ComponentRenderer node={active} action={action} onAction={onAction} />}
      </div>
    </div>
  );
}

function DisclosureNode({
  node,
  action,
  onAction,
  kind,
}: {
  node: ComponentNode;
  action?: FormAction;
  onAction?: ActionHandler;
  kind: "Modal" | "Drawer";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-component={kind}>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? "Close" : textProp(node, "label") || "Open"}
      </button>
      {open && (
        <div role={kind === "Modal" ? "dialog" : "complementary"}>
          {(node.children ?? []).map((child, index) => (
            <ComponentRenderer key={index} node={child} action={action} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavigationNode({ node, onAction }: { node: ComponentNode; onAction?: ActionHandler }) {
  const items = node.children ?? [];
  return (
    <nav data-component={node.type}>
      {items.map((item, index) => (
        <button key={index} type="button" onClick={() => onAction?.(textProp(item, "label"))}>
          {textProp(item, "label") || `Item ${index + 1}`}
        </button>
      ))}
    </nav>
  );
}
