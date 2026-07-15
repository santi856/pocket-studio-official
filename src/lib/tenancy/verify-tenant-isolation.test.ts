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

  function writeMultiFileFixture(files: Record<string, string>): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-isolation-fixture-"));
    for (const [name, contents] of Object.entries(files)) {
      fs.writeFileSync(path.join(tempDir, name), contents);
    }
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

  it("still flags a real violation even when a same-named, compliant helper exists in a different file (Level 3 review round 1, DEFECT 2) — proves same-name declarations across files never collide in the graph", () => {
    const dir = writeMultiFileFixture({
      "compliant.ts": `
        async function helper(actorUserId: string, projectId: string) {
          await requireProjectAccess(actorUserId, projectId, "MEMBER");
          return db.project.findUnique({ where: { id: projectId } });
        }

        export async function compliantCaller(actorUserId: string, projectId: string) {
          return helper(actorUserId, projectId);
        }
      `,
      "violating.ts": `
        async function helper(projectId: string) {
          return db.project.findUnique({ where: { id: projectId } });
        }

        export async function violatingCaller(actorUserId: string, projectId: string) {
          return helper(projectId);
        }
      `,
    });

    const violations = findTenantIsolationViolations(dir);

    expect(violations).toEqual([
      { functionName: "violatingCaller", file: expect.any(String), line: 6 },
    ]);
  });

  it("resolves a call to an unambiguous cross-file same-named function correctly", () => {
    const dir = writeMultiFileFixture({
      "helpers.ts": `
        export async function sharedHelper(actorUserId: string, projectId: string) {
          await requireProjectAccess(actorUserId, projectId, "MEMBER");
          return db.project.findUnique({ where: { id: projectId } });
        }
      `,
      "caller.ts": `
        export async function callsSharedHelper(actorUserId: string, projectId: string) {
          return sharedHelper(actorUserId, projectId);
        }
      `,
    });

    expect(findTenantIsolationViolations(dir)).toEqual([]);
  });

  it("still flags a violation even when a local function impersonates requireProjectAccess by name alone (Level 3 review round 2, finding 2)", () => {
    const dir = writeFixture(`
      async function requireProjectAccess(actorUserId: string, projectId: string) {
        return true;
      }

      export async function violatingCaller(actorUserId: string, projectId: string) {
        await requireProjectAccess(actorUserId, projectId);
        return db.project.findUnique({ where: { id: projectId } });
      }
    `);

    const violations = findTenantIsolationViolations(dir);

    expect(violations).toEqual([
      { functionName: "violatingCaller", file: expect.any(String), line: 6 },
    ]);
  });

  it("still trusts an unshadowed call to requireOrganizationMembership when no local function impersonates it", () => {
    const dir = writeFixture(`
      export async function checksOrgViaBareName(actorUserId: string, organizationId: string) {
        await requireOrganizationMembership(actorUserId, organizationId, "MEMBER");
        return db.organization.findUnique({ where: { id: organizationId } });
      }
    `);

    expect(findTenantIsolationViolations(dir)).toEqual([]);
  });
});
