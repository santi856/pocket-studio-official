import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// The single choke point every tenant-scoped function must transitively
// reach (src/lib/tenancy/authz.ts). This tool exists so that invariant is
// mechanically enforced going forward, not re-verified by hand each phase
// the way it was for P3-02 itself.
const AUTHZ_ROOTS = new Set(["requireProjectAccess", "requireOrganizationMembership"]);

// Every entry here must be a *deliberate, disclosed* exception, not a
// convenience escape hatch — this tool's entire value is that this set
// stays small and each entry is individually justified in code review.
const ALLOWED_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    "authenticateGeneratedAppUser",
    "Authenticates a project's own generated-app end user (GeneratedAppUser) " +
      "— a separate identity domain from Pocket Studio's own User/Membership " +
      "system, with no actorUserId to check a membership for. projectId here " +
      "is a lookup-scoping key (disambiguating the same email across " +
      "different generated apps' isolated user tables), not an " +
      "authorization-check subject. Not yet wired into any live route " +
      "(src/lib/generation/generated-app-auth.ts's own docstring); today's " +
      "access boundary is the caller's existing platform session + " +
      "requireProjectAccess, not this function.",
  ],
  [
    "applyBillingLifecycleEventFromWebhook",
    "The webhook-driven counterpart to transitionBillingState (P3-04, " +
      "src/lib/billing/subscription.ts) — deliberately has no actorUserId. " +
      "A cryptographically verified webhook event IS the authorization; " +
      "there is no Pocket Studio member 'acting' when Stripe reports what " +
      "already happened on its own side. The signature is verified by the " +
      "caller (src/lib/billing/webhook-processing.ts) before this function " +
      "is ever reached — same shape of exception as " +
      "authenticateGeneratedAppUser above.",
  ],
  [
    "createGeneratedAppCharge",
    "A generated product's own runtime charging its own end user (P3-06, " +
      "src/lib/generation/generated-app-payments.ts) — deliberately has no " +
      "actorUserId. There is no Pocket Studio member 'acting' when a " +
      "generated app processes its customer's payment; the Pocket Studio " +
      "member already authorized this exact use when they connected the " +
      "payment credential in the first place. Same shape of exception as " +
      "authenticateGeneratedAppUser and applyBillingLifecycleEventFromWebhook " +
      "above.",
  ],
  [
    "retrieveCredentialSecretForGeneratedApp",
    "The generated-app-runtime counterpart to retrieveCredentialSecret " +
      "(P3-06, src/lib/credentials/vault.ts) — deliberately has no " +
      "actorUserId, for the same reason createGeneratedAppCharge (its only " +
      "caller) does not: a generated product reading its own connected " +
      "payment credential to charge its own customer has no Pocket Studio " +
      "member 'acting' in that moment.",
  ],
  [
    "recordPolicyAcceptance",
    "A generated product's own end user accepting a published policy " +
      "document (P3-10, src/lib/product/policy-documents.ts) — " +
      "deliberately has no actorUserId, same shape of exception as " +
      "createGeneratedAppCharge: no Pocket Studio member 'acts' when a " +
      "generated app's own end user accepts its own terms. Not yet wired " +
      "into any live route, same disclosed gap as " +
      "authenticateGeneratedAppUser.",
  ],
  [
    "createGovernanceImpactAssessment",
    "Maps a real, operator-verified governance requirement " +
      "(GovernanceRequirement, platform-wide, not tenant-scoped) onto a " +
      "specific customer project (P3-10, " +
      "src/lib/governance/governance-requirements.ts) — deliberately does " +
      "not call requireProjectAccess. As of P3-13 it does require real " +
      "platform-admin access (requirePlatformAdmin, " +
      "src/lib/tenancy/platform-admin.ts), which is intentionally " +
      "cross-tenant: judging which projects a real legal/regulatory " +
      "requirement applies to is Pocket Studio's own operator judgment " +
      "call, not derived from that project's own organization's " +
      "membership.",
  ],
  [
    "notifyCustomerOfGovernanceImpact",
    "The 'customer notification' step of the governance-monitoring " +
      "pipeline (P3-10, Master Spec §33) — deliberately does not call " +
      "requireProjectAccess, same cross-tenant platform-admin posture as " +
      "createGovernanceImpactAssessment above (requires " +
      "requirePlatformAdmin as of P3-13): the system notifying a customer " +
      "that a real governance change affects their project is not " +
      "something the customer requests for themselves.",
  ],
  [
    "dismissGovernanceImpactAssessment",
    "Closes a NOT_MATERIAL governance impact assessment without any " +
      "customer-facing workflow (P3-10) — deliberately does not call " +
      "requireProjectAccess, same cross-tenant platform-admin posture as " +
      "createGovernanceImpactAssessment above (requires " +
      "requirePlatformAdmin as of P3-13): judging that a real requirement " +
      "does not actually apply to a project is Pocket Studio's own call, " +
      "not the customer's.",
  ],
]);

export type TenantIsolationViolation = {
  functionName: string;
  file: string;
  line: number;
};

/** Exposed so tests can assert the exception list stays exactly what was reviewed, not silently grown. */
export function getAllowedExceptionNames(): string[] {
  return [...ALLOWED_EXCEPTIONS.keys()].sort();
}

type FunctionInfo = {
  name: string;
  file: string;
  line: number;
  isExported: boolean;
  isTenantScoped: boolean;
  calls: Set<string>;
};

function collectSourceFiles(rootDir: string): string[] {
  const entries = fs.readdirSync(rootDir, { recursive: true, withFileTypes: true }) as fs.Dirent[];
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    files.push(path.join(entry.parentPath, entry.name));
  }
  return files;
}

const TENANT_SCOPE_PARAM_NAMES = new Set(["projectId", "organizationId"]);

function hasTenantScopedStringParam(node: ts.FunctionDeclaration): boolean {
  return node.parameters.some((param) => {
    if (!ts.isIdentifier(param.name) || !TENANT_SCOPE_PARAM_NAMES.has(param.name.text)) {
      return false;
    }
    const typeText = param.type?.getText();
    return typeText === "string";
  });
}

function functionKey(file: string, name: string): string {
  return `${file}:${name}`;
}

/**
 * Parses every `.ts` file under `src/lib` (excluding tests) and, for every
 * exported async function whose parameter list includes `projectId:
 * string` or `organizationId: string`, computes whether it transitively
 * calls `requireProjectAccess` or `requireOrganizationMembership` —
 * directly, or through any chain of calls to other functions in this same
 * codebase. A function that never reaches either is a real tenant-isolation
 * gap: it can read or write tenant-scoped data without ever checking the
 * caller belongs to that tenant.
 *
 * This is a name-based call graph, not a fully type-resolved one — but
 * every declaration is stored keyed by *file-qualified* name
 * (`functionsByKey`), never a bare name alone, so two unrelated functions
 * sharing the same name in different files can never silently overwrite
 * each other (Level 3 review round 1, DEFECT 2 — a synthetic fixture
 * proved the prior bare-name-keyed map let a genuine violation go
 * unreported when a same-named, compliant helper in another file was
 * processed later and won the map slot). Call resolution
 * (`resolveCall`) prefers a same-file declaration first — the dominant
 * real case, an exported function delegating to a local private helper —
 * and only falls back to a cross-file lookup when the name is genuinely
 * unambiguous (declared in exactly one file). A call whose target name is
 * ambiguous across files, and not resolvable in the caller's own file, is
 * treated as *not* reaching an authz root: the safe default for a
 * security-relevant analyzer is a false positive (a compliant function
 * gets flagged for human review) over a false negative (a real violation
 * goes unreported).
 */
export function findTenantIsolationViolations(
  rootDir = path.resolve(process.cwd(), "src/lib"),
): TenantIsolationViolation[] {
  const files = collectSourceFiles(rootDir);
  const functionsByKey = new Map<string, FunctionInfo>();
  const functionsByName = new Map<string, FunctionInfo[]>();

  for (const file of files) {
    const relativeFile = path.relative(process.cwd(), file);
    const sourceText = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node) => {
      // Every function declaration is tracked, not just exported ones —
      // otherwise a call routed through a private helper (e.g. an
      // exported function delegating to a local, unexported one that
      // itself calls requireProjectAccess) dead-ends the graph traversal
      // at the helper and produces a false positive. Only exported,
      // tenant-scoped functions are ever *reported* as violations
      // (below); every function is a valid graph *node*.
      if (ts.isFunctionDeclaration(node) && node.name) {
        const calls = new Set<string>();
        const collectCalls = (inner: ts.Node) => {
          if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression)) {
            calls.add(inner.expression.text);
          }
          ts.forEachChild(inner, collectCalls);
        };
        if (node.body) {
          ts.forEachChild(node.body, collectCalls);
        }

        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const info: FunctionInfo = {
          name: node.name.text,
          file: relativeFile,
          line: line + 1,
          isExported: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false,
          isTenantScoped: hasTenantScopedStringParam(node),
          calls,
        };
        functionsByKey.set(functionKey(relativeFile, info.name), info);
        const sameName = functionsByName.get(info.name) ?? [];
        sameName.push(info);
        functionsByName.set(info.name, sameName);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const resolveCall = (callerFile: string, calleeName: string): FunctionInfo | undefined => {
    const sameFile = functionsByKey.get(functionKey(callerFile, calleeName));
    if (sameFile) return sameFile;

    const candidates = functionsByName.get(calleeName) ?? [];
    return candidates.length === 1 ? candidates[0] : undefined;
  };

  const reachesAuthzRoot = (start: FunctionInfo): boolean => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const key = functionKey(current.file, current.name);
      if (seen.has(key)) continue;
      seen.add(key);

      for (const called of current.calls) {
        if (AUTHZ_ROOTS.has(called)) return true;
        const resolved = resolveCall(current.file, called);
        if (resolved && !seen.has(functionKey(resolved.file, resolved.name))) {
          stack.push(resolved);
        }
      }
    }
    return false;
  };

  const violations: TenantIsolationViolation[] = [];
  for (const info of functionsByKey.values()) {
    if (!info.isExported) continue;
    if (!info.isTenantScoped) continue;
    if (AUTHZ_ROOTS.has(info.name)) continue;
    if (ALLOWED_EXCEPTIONS.has(info.name)) continue;
    if (!reachesAuthzRoot(info)) {
      violations.push({ functionName: info.name, file: info.file, line: info.line });
    }
  }

  return violations.sort((a, b) => a.functionName.localeCompare(b.functionName));
}
