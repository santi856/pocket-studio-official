import { describe, expect, it } from "vitest";
import { bindScreenData } from "./screen-data-binding";
import type { ComponentNode } from "./component-registry";
import type { GeneratedRecord, Prisma } from "@/generated/prisma/client";

function record(data: Prisma.InputJsonValue): GeneratedRecord {
  return {
    id: "rec_1",
    projectId: "proj_1",
    modelKey: "Record",
    data: data as Prisma.JsonValue,
    ownerGeneratedAppUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("bindScreenData", () => {
  const screenWithList: ComponentNode = {
    type: "Screen",
    children: [
      { type: "Heading", props: { text: "Bookings" } },
      { type: "List", props: {} },
    ],
  };

  it("replaces the List node with LoadingState while loading", () => {
    const bound = bindScreenData(screenWithList, { status: "loading" });
    const listSlot = bound.children?.[1];
    expect(listSlot?.type).toBe("LoadingState");
  });

  it("replaces the List node with EmptyState when there are no records", () => {
    const bound = bindScreenData(screenWithList, { status: "empty", modelKey: "Record" });
    const listSlot = bound.children?.[1];
    expect(listSlot?.type).toBe("EmptyState");
    expect(listSlot?.props?.message).toContain("Record");
  });

  it("replaces the List node with ErrorState and preserves the real error message", () => {
    const bound = bindScreenData(screenWithList, {
      status: "error",
      message: "Screen has no data dependency.",
    });
    const listSlot = bound.children?.[1];
    expect(listSlot?.type).toBe("ErrorState");
    expect(listSlot?.props?.message).toBe("Screen has no data dependency.");
  });

  it("populates the List node with real record data on success, not a placeholder", () => {
    const records = [record({ status: "open" }), record({ status: "closed" })];
    const bound = bindScreenData(screenWithList, {
      status: "success",
      modelKey: "Record",
      records,
    });

    const listSlot = bound.children?.[1];
    expect(listSlot?.type).toBe("List");
    expect(listSlot?.props?.items).toEqual(["open", "closed"]);
  });

  it("falls back to the record id when a record's data has no primitive first value", () => {
    const records = [record({ nested: { a: 1 } })];
    const bound = bindScreenData(screenWithList, {
      status: "success",
      modelKey: "Record",
      records,
    });

    const listSlot = bound.children?.[1];
    expect(listSlot?.props?.items).toEqual(["rec_1"]);
  });

  it("leaves non-List nodes and screens with no List entirely untouched", () => {
    const node: ComponentNode = { type: "Heading", props: { text: "Static" } };
    const bound = bindScreenData(node, { status: "loading" });
    expect(bound).toEqual(node);
  });

  it("recurses through nested containers to find a List anywhere in the tree", () => {
    const nested: ComponentNode = {
      type: "Screen",
      children: [{ type: "Stack", children: [{ type: "List", props: {} }] }],
    };

    const bound = bindScreenData(nested, { status: "empty", modelKey: "Record" });

    expect(bound.children?.[0]?.children?.[0]?.type).toBe("EmptyState");
  });
});
