import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// The single choke point every tenant-scoped function must transitively
// reach (src/lib/tenancy/authz.ts). This tool exists so that invariant is
// mechanically enforced going forward, not re-verified by hand each phase
// the way it was for P3-02 itself.
//
// requireGeneratedAppSessionForProject (src/lib/generation/generated-app-session.ts)
// is a second, legitimate authz root for a second identity domain: a
// generated product's own end user (GeneratedAppUser) is not a Pocket
// Studio platform member, so requireProjectAccess does not — and should
// not — apply to it. It performs the equivalent check for that domain (a
// valid session whose owner belongs to the exact project requested), so a
// tenant-scoped function reaching it is exactly as authorized as one
// reaching requireProjectAccess, just for a different kind of caller.
const AUTHZ_ROOTS = new Set([
  "requireProjectAccess",
  "requireOrganizationMembership",
  "requireGeneratedAppSessionForProject",
]);

// Every entry here must be a *deliberate, disclosed* exception, not a
// convenience escape hatch — this tool's entire value is that this set
// stays small and each entry is individually justified in code review.
const ALLOWED_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    "beginGeneration",
    "The AI usage safety-limit choke point (src/lib/ai/generation-limits.ts) " +
      "— called only from resolveIntent (intent-resolver.ts) and " +
      "extractProductSemanticsForProject (semantic-extraction.ts), both of " +
      "which already call requireProjectAccess before this organizationId " +
      "is ever obtained. This function is not itself a tenant-data access " +
      "point: it never reads or returns any customer project/organization " +
      "content, only aggregate AiUsageEvent counts/sums for a quota check " +
      "and its own internal AiGenerationLease bookkeeping rows (a " +
      "concurrency accounting artifact, not customer data). A caller who " +
      "was never authorized for this organizationId could at most cause an " +
      "incorrect quota read or an extra lease row — not a disclosure or " +
      "mutation of any tenant's actual data.",
  ],
  [
    "authenticateGeneratedAppUser",
    "Authenticates a project's own generated-app end user (GeneratedAppUser) " +
      "— a separate identity domain from Pocket Studio's own User/Membership " +
      "system, with no actorUserId to check a membership for. projectId here " +
      "is a lookup-scoping key (disambiguating the same email across " +
      "different generated apps' isolated user tables), not an " +
      "authorization-check subject — this function's job ends at credential " +
      "verification, before any session exists to check. Now wired into a " +
      "real, unauthenticated route (src/app/org/[orgSlug]/[projectSlug]/app/sign-in) " +
      "via signInGeneratedAppUserAction: the real tenant boundary for every " +
      "request *after* login is requireGeneratedAppSessionForProject (a " +
      "recognized AUTHZ_ROOT above), not this function — the same " +
      "login-verification-has-no-tenant-yet-to-check shape as " +
      "authenticateUser (src/lib/services/users.ts), which is not excepted " +
      "here only because it has no projectId parameter to trigger this " +
      "analyzer at all.",
  ],
  [
    "signUpGeneratedAppUser",
    "Creates a project's own generated-app end user (GeneratedAppUser) — " +
      "same identity domain and same shape of exception as " +
      "authenticateGeneratedAppUser above: projectId scopes which " +
      "generated app the new account belongs to, it is not an " +
      "authorization-check subject, and there is no session yet at account " +
      "-creation time for requireGeneratedAppSessionForProject to check. " +
      "Wired into the same real, unauthenticated sign-up route.",
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
    "linkBillingProviderCustomerFromWebhook",
    "The webhook-driven counterpart to linkBillingProviderCustomer (P3-04, " +
      "src/lib/billing/subscription.ts) — deliberately has no actorUserId, " +
      "same shape of exception as applyBillingLifecycleEventFromWebhook " +
      "above. A real Stripe Checkout Session's checkout.session.completed " +
      "event IS the authorization to link its customer/subscription ids to " +
      "the organization named in the session's own client_reference_id " +
      "(set by this codebase itself at session-creation time, " +
      "src/lib/actions/billing-actions.ts) — there is no Pocket Studio " +
      "member 'acting' when Stripe reports its own checkout completed " +
      "server-to-server. The signature is verified by the caller " +
      "(src/lib/billing/webhook-processing.ts) before this function is " +
      "ever reached.",
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
    "setGeneratedAppSessionCookie",
    "One cookie per generated app, keyed by projectId in the cookie *name* " +
      "(src/lib/generation/generated-app-cookies.ts) — projectId here is a " +
      "storage-scoping key so two different generated apps' sessions can " +
      "coexist in one browser, not an authorization-check subject. Same " +
      "shape of exception as authenticateGeneratedAppUser above: setting a " +
      "cookie is not itself an authorization decision. The real check " +
      "happens on read, via requireGeneratedAppSessionForProject (a " +
      "recognized AUTHZ_ROOT).",
  ],
  [
    "clearGeneratedAppSessionCookie",
    "The sign-out counterpart to setGeneratedAppSessionCookie above — same " +
      "exception, same reason: projectId only selects which generated " +
      "app's cookie to delete.",
  ],
  [
    "getGeneratedAppSessionTokenFromCookies",
    "The read counterpart to setGeneratedAppSessionCookie above — returns " +
      "whatever raw token (if any) is stored under this project's cookie " +
      "name. Deliberately does not itself authorize anything: the returned " +
      "token still has to pass requireGeneratedAppSessionForProject before " +
      "any tenant-scoped data is touched, the same way reading a platform " +
      "session cookie (getSessionTokenFromCookies, src/lib/auth/cookies.ts) " +
      "is not itself an authorization check either.",
  ],
  [
    "syncPublicationsForBillingAccessChange",
    "Publishing Milestone 1 (2026-07-27) — called only from " +
      "applyBillingStateTransition (src/lib/billing/subscription.ts), the " +
      "single choke point every billing state change already passes " +
      "through, member-driven or webhook-driven. Deliberately has no " +
      "actorUserId, same shape of exception as " +
      "applyBillingLifecycleEventFromWebhook: a billing state transition " +
      "IS the authorization to suspend or restore that organization's own " +
      "publications, there is no Pocket Studio member 'acting' in that " +
      "moment. Only ever mutates ProjectPublication rows already scoped to " +
      "the organizationId it was called with (via project.organizationId), " +
      "never accepts or trusts a client-supplied id.",
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
 *
 * A bare-name call to `requireProjectAccess`/`requireOrganizationMembership`
 * is trusted as reaching the real authz root only when the calling
 * function's own file does not itself declare a same-named local function
 * (Level 3 review round 2, finding 2 — a local function merely *named*
 * `requireProjectAccess` that does nothing previously defeated this check
 * entirely, since the prior version matched the call's bare text with no
 * identity check at all). Residual, disclosed scope boundary: a same-named
 * impersonator declared in a *different* file than the caller (not the
 * caller's own file) is not specifically defended against beyond the
 * general collision-safety guarantee above — closing that fully would
 * require real import-graph resolution, not proportionate for this
 * codebase's actual size and its consistent one-function-one-name
 * convention (documented above).
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
        // AUTHZ_ROOTS names are trusted by bare name ONLY when nothing in
        // the calling file itself declares a same-named local function —
        // requireProjectAccess/requireOrganizationMembership are always
        // imported from src/lib/tenancy/authz.ts, never locally declared
        // by a real caller, so an unshadowed bare-name match is a real
        // call to the genuine authz root (this AST-only tool never
        // resolves imports). But if the calling file *does* declare its
        // own local function with that exact name, that local
        // declaration shadows the import — resolveCall's same-file-first
        // rule below correctly routes the call to the impersonator
        // instead, which then has to earn its own path to a real authz
        // root like any other function (Level 3 review round 2, finding
        // 2 — a local function merely named `requireProjectAccess` that
        // does nothing previously defeated this check entirely).
        if (AUTHZ_ROOTS.has(called) && !functionsByKey.has(functionKey(current.file, called))) {
          return true;
        }
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
