import { describe, expect, it } from "vitest";
import { generateManifest } from "./pwa";

describe("generateManifest", () => {
  const project = { name: "Booking App", slug: "booking-app" };

  it("uses Product DNA purpose as the manifest name when available", () => {
    const manifest = generateManifest(project, "detailer-co", {
      purpose: "Premium detailing bookings",
    });

    expect(manifest.name).toBe("Premium detailing bookings");
    expect(manifest.start_url).toBe("/org/detailer-co/booking-app");
    expect(manifest.scope).toBe("/org/detailer-co/booking-app");
    expect(manifest.display).toBe("standalone");
  });

  it("falls back to the project name when Product DNA has no purpose", () => {
    const manifest = generateManifest(project, "detailer-co", null);

    expect(manifest.name).toBe("Booking App");
  });

  it("truncates a long name into a short_name under 30 characters", () => {
    const manifest = generateManifest(project, "detailer-co", {
      purpose: "A very long product purpose that exceeds thirty characters easily",
    });

    expect(manifest.short_name.length).toBeLessThanOrEqual(30);
    expect(manifest.short_name.endsWith("...")).toBe(true);
  });

  it("references a real, existing icon rather than a fabricated one", () => {
    const manifest = generateManifest(project, "detailer-co", null);

    expect(manifest.icons).toEqual([{ src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }]);
  });
});
