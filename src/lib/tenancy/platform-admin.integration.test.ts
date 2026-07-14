// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { ForbiddenError } from "./authz";
import {
  AlreadyPlatformAdminError,
  LastPlatformAdminError,
  PlatformAdminNotFoundError,
  grantPlatformAdmin,
  isPlatformAdmin,
  listPlatformAdmins,
  requirePlatformAdmin,
  revokePlatformAdmin,
} from "./platform-admin";

describe("platform admin", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("is false for a user with no grant at all", async () => {
    const user = await registerUser({ email: "user@example.com", password: "password123" });

    expect(await isPlatformAdmin(user.id)).toBe(false);
    await expect(requirePlatformAdmin(user.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("bootstraps the very first admin — a self-grant with no existing admin succeeds", async () => {
    const user = await registerUser({ email: "user@example.com", password: "password123" });

    const grant = await grantPlatformAdmin(user.id, user.id);

    expect(grant.userId).toBe(user.id);
    expect(await isPlatformAdmin(user.id)).toBe(true);
  });

  it("bootstraps by granting a different user when no admin exists yet", async () => {
    const bootstrapper = await registerUser({
      email: "bootstrapper@example.com",
      password: "password123",
    });
    const target = await registerUser({ email: "target@example.com", password: "password123" });

    await grantPlatformAdmin(bootstrapper.id, target.id);

    expect(await isPlatformAdmin(target.id)).toBe(true);
    // The bootstrapper themselves never received a grant.
    expect(await isPlatformAdmin(bootstrapper.id)).toBe(false);
  });

  it("once an admin exists, only an existing admin can grant another", async () => {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);
    const nonAdmin = await registerUser({ email: "nonadmin@example.com", password: "password123" });
    const target = await registerUser({ email: "target@example.com", password: "password123" });

    await expect(grantPlatformAdmin(nonAdmin.id, target.id)).rejects.toBeInstanceOf(ForbiddenError);

    const grant = await grantPlatformAdmin(admin.id, target.id);
    expect(await isPlatformAdmin(target.id)).toBe(true);
    expect(grant.grantedByUserId).toBe(admin.id);
  });

  it("throws AlreadyPlatformAdminError for a user already actively granted", async () => {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);
    const target = await registerUser({ email: "target@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, target.id);

    await expect(grantPlatformAdmin(admin.id, target.id)).rejects.toBeInstanceOf(
      AlreadyPlatformAdminError,
    );
  });

  it("revokes an admin, and the revoked user immediately loses access", async () => {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);
    const target = await registerUser({ email: "target@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, target.id);

    const revoked = await revokePlatformAdmin(admin.id, target.id);

    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedByUserId).toBe(admin.id);
    expect(await isPlatformAdmin(target.id)).toBe(false);
  });

  it("refuses to revoke the last remaining admin", async () => {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);

    await expect(revokePlatformAdmin(admin.id, admin.id)).rejects.toBeInstanceOf(
      LastPlatformAdminError,
    );
  });

  it("throws PlatformAdminNotFoundError for a user with no active grant", async () => {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);
    const other = await registerUser({ email: "other@example.com", password: "password123" });

    await expect(revokePlatformAdmin(admin.id, other.id)).rejects.toBeInstanceOf(
      PlatformAdminNotFoundError,
    );
  });

  it("allows re-granting a previously revoked admin", async () => {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);
    const target = await registerUser({ email: "target@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, target.id);
    await revokePlatformAdmin(admin.id, target.id);

    await grantPlatformAdmin(admin.id, target.id);

    expect(await isPlatformAdmin(target.id)).toBe(true);
  });

  it("listPlatformAdmins returns only active grants and requires admin access", async () => {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);
    const revokedTarget = await registerUser({
      email: "revoked@example.com",
      password: "password123",
    });
    await grantPlatformAdmin(admin.id, revokedTarget.id);
    await revokePlatformAdmin(admin.id, revokedTarget.id);

    const admins = await listPlatformAdmins(admin.id);
    expect(admins.map((entry) => entry.userId)).toEqual([admin.id]);

    const nonAdmin = await registerUser({ email: "nonadmin@example.com", password: "password123" });
    await expect(listPlatformAdmins(nonAdmin.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
