import type { ComponentNode } from "./component-registry";
import type { GeneratedRecord } from "@/generated/prisma/client";

export type ScreenDataState =
  | { status: "loading" }
  | { status: "empty"; modelKey: string }
  | { status: "error"; message: string }
  | { status: "success"; modelKey: string; records: GeneratedRecord[] };

function summarizeRecord(record: GeneratedRecord): string {
  const data = record.data as Record<string, unknown> | null;
  const firstValue = data && typeof data === "object" ? Object.values(data)[0] : undefined;
  return typeof firstValue === "string" || typeof firstValue === "number"
    ? String(firstValue)
    : record.id;
}

function bindListNode(dataState: ScreenDataState): ComponentNode {
  switch (dataState.status) {
    case "loading":
      return { type: "LoadingState", props: { message: "Loading…" } };
    case "empty":
      return { type: "EmptyState", props: { message: `No ${dataState.modelKey} records yet.` } };
    case "error":
      return { type: "ErrorState", props: { message: dataState.message } };
    case "success":
      return {
        type: "List",
        props: { items: dataState.records.map(summarizeRecord) },
      };
  }
}

/**
 * Master Spec §25/§26: "Generated demonstrations must come from structured
 * artifacts — not hardcoded preview screens." Binds a screen's real data
 * state onto its `ComponentNode` tree before it reaches the renderer: a
 * `List` node is replaced with the actual record data on success, or with
 * a matching `LoadingState`/`EmptyState`/`ErrorState` node — never silently
 * rendered as an empty list when data hasn't loaded or failed to. Pure and
 * DOM-free so it is unit-testable independent of both the renderer
 * (component-renderer.tsx) and the database (render-runtime.ts).
 */
export function bindScreenData(node: ComponentNode, dataState: ScreenDataState): ComponentNode {
  if (node.type === "List") {
    return bindListNode(dataState);
  }
  if (!node.children) {
    return node;
  }
  return {
    ...node,
    children: node.children.map((child) => bindScreenData(child, dataState)),
  };
}
