import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findTenantIsolationViolations, getAllowedExceptionNames } from "./verify-tenant-isolation";

describe("findTenantIsolationViolations against the real codebase", () => {
  it("finds zero violations in src/lib as it exists today — the regression gate this tool exists for", () => {
    const violations = findTenantIsolationViolations();

    expect(violations).toEqual([]);
  });

  it("the allowed-exceptions list is exactly what was reviewed and justified — a diff here means a new exception was added and must be re-reviewed, not silently grown", () => {
    expect(getAllowedExceptionNames()).toEqual([
      "applyBillingLifecycleEventFromWebhook",
      "authenticateGeneratedAppUser",
      "createGeneratedAppCharge",
      "createGovernanceImpactAssessment",
      "dismissGovernanceImpactAssessment",
      "notifyCustomerOfGovernanceImpact",
      "recordPolicyAcceptance",
      "retrieveCredentialSecretForGeneratedApp",
    ]);
  });
});

describe("findTenantIsolationViolations detector correctness (against synthetic fixtures)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function writeFixture(contents: string): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-isolation-fixture-"));
    fs.writeFileSync(path.join(tempDir, "fixture.ts"), contents);
    return tempDir;
  }

  it("flags a project-scoped function that never checks access — proves the detector is not vacuous", () => {
    const dir = writeFixture(`
      export async function leaksData(actorUserId: string, projectId: string) {
        return db.project.findUnique({ where: { id: projectId } });
      }
    `);

    const violations = findTenantIsolationViolations(dir);

    expect(violations).toEqual([{ functionName: "leaksData", file: expect.any(String), line: 2 }]);
  });

  it("does not flag a function that calls requireProjectAccess directly", () => {
    const dir = writeFixture(`
      export async function checksDirectly(actorUserId: string, projectId: string) {
        await requireProjectAccess(actorUserId, projectId, "MEMBER");
        return db.project.findUnique({ where: { id: projectId } });
      }
    `);

    expect(findTenantIsolationViolations(dir)).toEqual([]);
  });

  it("does not flag a function that calls requireOrganizationMembership directly", () => {
    const dir = writeFixture(`
      export async function checksOrgDirectly(actorUserId: string, projectId: string) {
        await requireOrganizationMembership(actorUserId, "org-1", "MEMBER");
        return db.project.findUnique({ where: { id: projectId } });
      }
    `);

    expect(findTenantIsolationViolations(dir)).toEqual([]);
  });

  it("does not flag a function that delegates transitively to an already-checked function", () => {
    const dir = writeFixture(`
      export async function checkedInner(actorUserId: string, projectId: string) {
        await requireProjectAccess(actorUserId, projectId, "MEMBER");
        return db.project.findUnique({ where: { id: projectId } });
      }

      export async function delegatesOuter(actorUserId: string, projectId: string) {
        return checkedInner(actorUserId, projectId);
      }
    `);

    expect(findTenantIsolationViolations(dir)).toEqual([]);
  });

  it("does not flag a function with no tenant-scoped parameter at all", () => {
    const dir = writeFixture(`
      export async function unrelated(actorUserId: string, userId: string) {
        return db.user.findUnique({ where: { id: userId } });
      }
    `);

    expect(findTenantIsolationViolations(dir)).toEqual([]);
  });

  it("flags a function scoped by organizationId (not just projectId) that never checks access", () => {
    const dir = writeFixture(`
      export async function leaksOrgData(actorUserId: string, organizationId: string) {
        return db.organization.findUnique({ where: { id: organizationId } });
      }
    `);

    const violations = findTenantIsolationViolations(dir);

    expect(violations).toEqual([
      { functionName: "leaksOrgData", file: expect.any(String), line: 2 },
    ]);
  });

  it("does not flag a function that delegates to a private (unexported) helper which itself checks access — regression: the graph must include unexported functions as nodes, not just exported ones", () => {
    const dir = writeFixture(`
      async function checkedHelper(actorUserId: string, projectId: string) {
        await requireProjectAccess(actorUserId, projectId, "MEMBER");
        return db.project.findUnique({ where: { id: projectId } });
      }

      export async function delegatesToPrivateHelper(actorUserId: string, projectId: string) {
        return checkedHelper(actorUserId, projectId);
      }
    `);

    expect(findTenantIsolationViolations(dir)).toEqual([]);
  });

  it("still flags a function that delegates to a private helper which does NOT check access", () => {
    const dir = writeFixture(`
      async function uncheckedHelper(projectId: string) {
        return db.project.findUnique({ where: { id: projectId } });
      }

      export async function delegatesToUncheckedHelper(actorUserId: string, projectId: string) {
        return uncheckedHelper(projectId);
      }
    `);

    const violations = findTenantIsolationViolations(dir);

    expect(violations).toEqual([
      { functionName: "delegatesToUncheckedHelper", file: expect.any(String), line: 6 },
    ]);
  });
});
