// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import {
  generateUniquePublicSlug,
  isReservedPublicSlug,
  normalizePublicSlugCandidate,
} from "./public-slug";

describe("normalizePublicSlugCandidate", () => {
  it("lowercases, hyphenates, and strips unsafe characters", () => {
    expect(normalizePublicSlugCandidate("My HVAC CRM!!")).toBe("my-hvac-crm");
    expect(normalizePublicSlugCandidate("  spaced  out  ")).toBe("spaced-out");
    expect(normalizePublicSlugCandidate("../../etc/passwd")).toBe("etc-passwd");
    expect(normalizePublicSlugCandidate("<script>alert(1)</script>")).toBe("script-alert-1-script");
  });
});

describe("isReservedPublicSlug", () => {
  it("rejects reserved system/route names case-insensitively", () => {
    expect(isReservedPublicSlug("sign-in")).toBe(true);
    expect(isReservedPublicSlug("Sign-In")).toBe(true);
    expect(isReservedPublicSlug("ADMIN")).toBe(true);
    expect(isReservedPublicSlug("my-real-app")).toBe(false);
  });
});

describe("generateUniquePublicSlug", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Detailer Booking App",
      createdByUserId: owner.id,
    });
    return { owner, org, project };
  }

  it("generates a normalized slug from the project name", async () => {
    const slug = await generateUniquePublicSlug("Detailer Booking App");
    expect(slug).toBe("detailer-booking-app");
  });

  it("appends a numeric suffix on collision with an existing publication", async () => {
    const { owner, project } = await seedProject();
    await db.projectPublication.create({
      data: { projectId: project.id, publicSlug: "detailer-booking-app" },
    });
    void owner;

    const slug = await generateUniquePublicSlug("Detailer Booking App");
    expect(slug).toBe("detailer-booking-app-2");
  });

  it("never returns a reserved name, even as a bare match", async () => {
    const slug = await generateUniquePublicSlug("sign-in");
    expect(isReservedPublicSlug(slug)).toBe(false);
    expect(slug).toBe("sign-in-app");
  });

  it("falls back to a safe default when the name normalizes to nothing — 'app' is itself reserved, so it gets a suffix", async () => {
    const slug = await generateUniquePublicSlug("!!!");
    expect(slug).toBe("app-app");
  });
});
