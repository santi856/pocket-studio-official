// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MockAIProvider } from "./mock-provider";

describe("MockAIProvider.resolveIntent", () => {
  const provider = new MockAIProvider();

  it("classifies a short, low-signal submission as unclear", async () => {
    const result = await provider.resolveIntent({ rawText: "hi", hasExistingProductState: false });
    expect(result.type).toBe("unclear");
    expect(result.confidence).toBe("low");
  });

  it("classifies a first meaningful submission as describe_idea", async () => {
    const result = await provider.resolveIntent({
      rawText: "Build a premium booking app for mobile detailers.",
      hasExistingProductState: false,
    });
    expect(result.type).toBe("describe_idea");
    expect(result.confidence).toBe("high");
  });

  it("classifies a meaningful submission against an existing project as edit_request", async () => {
    const result = await provider.resolveIntent({
      rawText: "Add appointment deposits and monthly memberships.",
      hasExistingProductState: true,
    });
    expect(result.type).toBe("edit_request");
  });

  it("does not paraphrase — summary echoes the trimmed input", async () => {
    const result = await provider.resolveIntent({
      rawText: "  Build a booking app.  ",
      hasExistingProductState: false,
    });
    expect(result.summary).toBe("Build a booking app.");
  });
});
