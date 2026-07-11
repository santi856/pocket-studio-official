import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Mobile Detailers Co")).toBe("mobile-detailers-co");
  });

  it("strips non-alphanumeric characters", () => {
    expect(slugify("Jess & Sons, LLC!")).toBe("jess-sons-llc");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Weird Input--  ")).toBe("weird-input");
  });

  it("returns an empty string for input with no alphanumeric characters", () => {
    expect(slugify("!!!")).toBe("");
  });
});
