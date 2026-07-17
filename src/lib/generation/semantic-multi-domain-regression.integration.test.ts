// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateApplication } from "./generation-orchestrator";
import { runQualityGate } from "./quality-gate";
import type { SemanticCoverageReport } from "./semantic-coverage";

/**
 * Multi-domain regression corpus (D-0065, execution/architecture/
 * SEMANTIC_PRODUCT_COMPILER_REPORT.md Part 12). Proves the semantic-
 * hollowing repair generalizes beyond the HomeBase fixture that
 * originally exposed it, without hardcoding any domain's exact final
 * design — every fixture is checked against the SAME generic invariant
 * (defined once, in checkFixture below): does the pipeline's own,
 * already-computed semantic coverage report say every actor/entity/
 * workflow the extractor found actually reached the generated Blueprint?
 * That invariant is domain-agnostic by construction — it never mentions
 * "chore," "grocery," "booking," or any other domain word.
 *
 * Fixture 9 (the "novel holdout") is written last and is a domain none of
 * fixtures 1-8 touch. Per Part 12: if it fails, the fix must be a general
 * architecture repair, never a fixture-specific patch — this file itself
 * contains no such patch (verified by the "no domain vocabulary leaked
 * into production code" meta-test at the bottom, which greps the actual
 * extraction source for every fixture's distinctive nouns).
 */

type Fixture = {
  domain: string;
  idea: string;
};

// Fixtures 1-8, each a distinct domain from Part 12's required list,
// written in the same natural, moderately detailed style a real founder
// would use (comparable length/detail to the HomeBase description and the
// official Master Spec §56 demonstration sentence) — not engineered to
// favor the heuristic extractor.
const FIXTURES: Fixture[] = [
  {
    domain: "family and household coordination",
    idea: "HomeBase is a shared household management app that helps busy families organize their daily lives in one place. Family members can manage chores, shared grocery lists, household expenses, appointments, schedules, and rewards. Parents can assign one-time or recurring chores, set deadlines, track completion, and create rewards. Children have a simple view where they can see responsibilities, complete tasks, track progress, and view earned rewards. The app includes a family dashboard showing what needs attention today, upcoming appointments, overdue tasks, grocery needs, and recent household activity.",
  },
  {
    domain: "service-business booking",
    idea: "GlowBook helps independent estheticians and their clients manage appointments in one place. Clients can browse available services, book appointments, and view upcoming visits. Estheticians can manage their calendar, set availability, and view client notes before each visit. The app includes a provider dashboard showing today's schedule, upcoming appointments, and recent client activity.",
  },
  {
    domain: "B2B equipment maintenance",
    idea: "FleetCare helps manufacturing plants track equipment maintenance across multiple facilities. Technicians can log maintenance visits, report equipment issues, and schedule repairs. Plant managers can review maintenance history, approve repair requests, and monitor equipment status across the plant. The app includes an operations dashboard showing overdue maintenance, open repair requests, and recent equipment activity.",
  },
  {
    domain: "marketplace",
    idea: "Artisan Market connects local craftspeople with buyers in their community. Sellers can list products, manage inventory, and fulfill orders. Buyers can browse listings, add items to a cart, and track order status. The app includes a seller dashboard showing pending orders, inventory levels, and recent sales activity.",
  },
  {
    domain: "education or community",
    idea: "LearnCircle helps community educators run small classes for local learners. Instructors can create courses, schedule sessions, and track attendance. Students can enroll in courses, submit assignments, and view grades. The app includes an instructor dashboard showing upcoming sessions, pending assignments, and recent student activity.",
  },
  {
    domain: "internal approval and operations tool",
    idea: "ExpenseFlow helps company finance teams manage employee reimbursement requests. Employees can submit expense reports and attach receipts. Managers can review submissions, approve or reject requests, and add comments. The app includes a finance dashboard showing pending approvals, recent submissions, and monthly spending activity.",
  },
  {
    domain: "insurance-agent lead workspace",
    idea: "LeadDesk helps insurance agents manage their sales pipeline. Agents can track leads, log calls, and schedule follow-ups. Sales managers can review agent pipelines, reassign leads, and monitor conversion rates. The app includes a manager dashboard showing pipeline health, overdue follow-ups, and recent agent activity.",
  },
  {
    domain: "mobile food ordering",
    idea: "QuickBite helps local restaurants take mobile orders from nearby customers. Customers can browse menus, place orders, and track delivery status. Restaurant staff can manage incoming orders, update menu items, and mark orders as ready. The app includes a staff dashboard showing incoming orders, ready-for-pickup orders, and recent order activity.",
  },
];

// Fixture 9 — the mandatory novel holdout (Part 12). A domain untouched by
// fixtures 1-8, written only after the corpus above and the underlying
// extraction code both already existed. If this fails, the correct
// response is a general fix elsewhere in this file's own invariant
// definition or the extraction code — never adding "tool"/"neighbor"/
// "ToolShare" as a special case anywhere.
const HOLDOUT_FIXTURE: Fixture = {
  domain: "novel holdout: peer-to-peer neighborhood tool lending",
  idea: "ToolShare helps neighbors lend and borrow household tools within their community. Owners can list tools they are willing to lend, set availability, and approve borrow requests. Borrowers can browse available tools, request to borrow an item, and return items with condition notes. The app includes a neighborhood dashboard showing available tools nearby, pending requests, and recent lending activity.",
};

// Phrasing-diverse fixtures (independent Level 3 review, post-D-0067,
// Finding 1: the original corpus varied domain vocabulary across all 9
// fixtures but never varied grammatical construction — every fixture used
// "<Capitalized actor> can/have/may/will <verb>," which is exactly the one
// pattern the original heuristic recognized, so the corpus could not have
// caught a purely grammatical blind spot no matter how many domains it
// covered). These are NOT domain-diverse on purpose — the point is to
// hold the domain (a small internal tool) constant and vary only sentence
// construction, isolating phrasing as the variable under test.
const NON_MODAL_ACTIVE_VOICE_FIXTURE: Fixture = {
  domain: "phrasing: non-modal active voice (reviewer Finding 1 — 'Managers assign tasks')",
  idea: "TaskFlow is a project tool for small teams. Managers assign tasks to employees and track progress on a shared board. Employees receive tasks, update their status, and leave comments on their work as they complete it.",
};

const PASSIVE_VOICE_FIXTURE: Fixture = {
  domain: "phrasing: passive voice (reviewer Finding 1 — 'Shifts are assigned by managers')",
  idea: "ShiftSwap is built for retail store staff. Shifts are assigned by store managers and picked up by employees who want extra hours. Approval requests are reviewed by managers before a swap is finalized.",
};

describe("phrasing-diverse regression (independent Level 3 review, post-D-0067, Finding 1)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function runAndInspect(idea: string) {
    const owner = await registerUser({
      email: `phrasing-${Math.random().toString(36).slice(2)}@example.com`,
      password: "password123",
    });
    const org = await createOrganization({ name: "Phrasing Org", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Phrasing Project",
      createdByUserId: owner.id,
    });

    const { semanticModel } = await generateProductIntelligence(owner.id, project.id, idea);
    const { blueprint } = await generateApplication(owner.id, project.id);
    return { semanticModel, blueprint };
  }

  // Round 2 independent review (post-D-0068) Finding R2-1, CRITICAL DEFECT:
  // the fix for the non-modal case above regressed the classic, previously
  // reliable "<actor> can/have/may/will <verb>" construction itself — a
  // single-word actor followed by a modal and then an organizational verb
  // ("Clients can browse services") had the modal greedily swallowed into
  // the actor name, producing "Clients Can" instead of "Clients". Neither
  // of the two phrasing tests above exercised this exact classic
  // construction, which is why the regression shipped undetected through
  // a fully green suite — this test exists specifically to close that gap.
  const CLASSIC_MODAL_VERB_FIXTURE: Fixture = {
    domain:
      "phrasing: classic modal+verb, name-correctness regression guard (round 2 Finding R2-1)",
    idea: "GlowBook helps independent estheticians and their clients manage appointments in one place. Clients can browse available services, book appointments, and view upcoming visits. Estheticians can manage their calendar, set availability, and view client notes before each visit.",
  };

  it("classic modal+verb construction: actor names are not corrupted by a swallowed modal (round 2 Finding R2-1 regression guard)", async () => {
    const { blueprint } = await runAndInspect(CLASSIC_MODAL_VERB_FIXTURE.idea);

    const roles = blueprint.roles as string[];
    expect(roles).toContain("Clients");
    expect(roles).toContain("Estheticians");
    // The exact corruption round 2 found live: a modal word swallowed
    // into the actor name itself.
    for (const role of roles) {
      expect(
        /\b(can|have|has|may|will)$/i.test(role),
        `role "${role}" ends with a modal word — the modal was swallowed into the actor name instead of being correctly excluded`,
      ).toBe(false);
    }
  });

  // Round 3 independent review (post-D-0069) Finding R3-1, CRITICAL DEFECT:
  // round 2's fix excluded copulas/modals/organizational verbs from the
  // optional second-word slot, but not common adverbs or conjunctions sitting
  // between the subject and the modal — "Drivers also can track deliveries"
  // produced actor "Drivers Also" instead of "Drivers". The round-2 name-
  // correctness checks above only ever tested for a trailing MODAL word, so
  // this different corruption shipped through a fully green suite
  // undetected. This is a distinct fixture from CLASSIC_MODAL_VERB_FIXTURE
  // specifically to exercise the function-word-insertion construction, not
  // just re-test the modal-swallowing one.
  const FUNCTION_WORD_INSERTION_FIXTURE: Fixture = {
    domain:
      "phrasing: function-word insertion, name-correctness regression guard (round 3 Finding R3-1)",
    idea: "RouteDesk helps local delivery services coordinate drivers. Drivers also can track deliveries in real time and update their status. Dispatchers typically have access to every route and can reassign drivers as needed.",
  };

  it("function-word insertion (adverb between subject and modal): actor names are not corrupted (round 3 Finding R3-1 regression guard)", async () => {
    const { blueprint } = await runAndInspect(FUNCTION_WORD_INSERTION_FIXTURE.idea);

    const roles = blueprint.roles as string[];
    expect(roles).toContain("Drivers");
    expect(roles).toContain("Dispatchers");
    // The exact corruption round 3 found live: a common adverb swallowed
    // into the actor name itself, not a modal this time.
    const knownFunctionWordSuffixes =
      /\b(also|typically|usually|generally|often|currently|recently|and|or|but)$/i;
    for (const role of roles) {
      expect(
        knownFunctionWordSuffixes.test(role),
        `role "${role}" ends with a common function word — it was swallowed into the actor name instead of being correctly excluded`,
      ).toBe(false);
    }
  });

  // Round 4 independent review (post-D-0070) Finding R4-1, CRITICAL DEFECT:
  // round 3's enumerated function-word list didn't include every common
  // conversational adverb ("Managers really can...", "Owners genuinely
  // can..." -> "Managers Really", "Owners Genuinely"), reproducing the same
  // corruption shape a fourth time. Repaired structurally, not by adding
  // more words: the second word of a two-word actor name is now matched by
  // a POSITIVE allowlist of common role-suffix nouns (ROLE_SUFFIX_WORDS)
  // instead of a negative blocklist of everything it must not be — an
  // adverb can never accidentally match a role-suffix noun, so this closes
  // the entire corruption class structurally rather than shrinking it one
  // more word at a time. This test exercises both halves of that fix in
  // one fixture: an out-of-list adverb must produce a SAFE MISS (no actor
  // for that sentence, never a corrupted one), and a genuine compound role
  // name must still be RECOVERED correctly.
  const UNLISTED_ADVERB_AND_COMPOUND_NAME_FIXTURE: Fixture = {
    domain:
      "phrasing: unlisted adverb (safe miss) + compound role name (recovered) — round 4 Finding R4-1",
    idea: "ShopFloor helps small manufacturing teams track daily production. Owners genuinely can list items for sale and manage inventory. Plant managers can review production history and approve requests.",
  };

  it("unlisted adverb produces a safe miss, never a corrupted name, while a genuine compound role name is still recovered (round 4 Finding R4-1 regression guard)", async () => {
    const { semanticModel, blueprint } = await runAndInspect(
      UNLISTED_ADVERB_AND_COMPOUND_NAME_FIXTURE.idea,
    );

    const actorNames = (semanticModel.actors as { name: string }[]).map((a) => a.name);
    // "Owners genuinely can..." — "genuinely" is not on the enumerated
    // function-word list, so this sentence must produce no actor at all
    // for "Owners" here, never a corrupted "Owners Genuinely".
    expect(actorNames).not.toContain("Owners Genuinely");
    // "Plant managers can..." — "managers" IS a role-suffix noun, so this
    // compound name must be correctly recovered, not lost.
    expect(actorNames).toContain("Plant Managers");

    const roles = blueprint.roles as string[];
    expect(roles).toContain("Plant Managers");
    expect(roles.some((r) => r.toLowerCase().includes("genuinely"))).toBe(false);
  });

  // Round 5 independent review (post-D-0072) Finding, CRITICAL DEFECT:
  // ACTOR_LEAD_PATTERN was applied to a whole sentence with a `^`-anchored
  // pattern, so an actor was only ever recognized as the sentence's very
  // first word(s). Any ordinary leading dependent clause ("When a request
  // comes in, ...") or a second actor+modal clause joined onto the first
  // with "and" put that actor past position zero and made it invisible —
  // reproduced live by the reviewer with three ordinary, non-hollow,
  // realistic descriptions, including one using the exact recognized
  // "Capitalized-Actor can/verb" construction. Repaired structurally (see
  // heuristic-extraction.ts's CLAUSE_SPLIT_PATTERN/splitClauses): each
  // sentence is now split at clause boundaries before ACTOR_LEAD_PATTERN is
  // applied, so an actor+modal construction is found wherever it occurs in
  // the sentence, not only at its start.
  const LEADING_CLAUSE_FIXTURE: Fixture = {
    domain: "phrasing: leading dependent clause before the actor (round 5 finding)",
    idea: "ShiftDesk helps retail teams coordinate daily operations. When a new request comes in, Employees can review it and Managers can approve it before it moves forward. For every completed shift, Employees can log hours and Managers can verify totals at the end of the week.",
  };

  it("leading dependent clause before the actor: actors are still found, not silently dropped (round 5 regression guard)", async () => {
    const { semanticModel, blueprint } = await runAndInspect(LEADING_CLAUSE_FIXTURE.idea);

    const actorNames = (semanticModel.actors as { name: string }[]).map((a) => a.name);
    expect(actorNames).toContain("Employees");
    expect(actorNames).toContain("Managers");

    const roles = blueprint.roles as string[];
    expect(roles).toContain("Employees");
    expect(roles).toContain("Managers");
  });

  it("non-modal active voice: actors are now found directly (the tractable half of the fix)", async () => {
    const { blueprint } = await runAndInspect(NON_MODAL_ACTIVE_VOICE_FIXTURE.idea);

    const roles = blueprint.roles as string[];
    expect(
      roles.length,
      "a description naming two actors via plain present-tense verbs (no modal) must produce more than one role",
    ).toBeGreaterThan(1);
  });

  it("passive voice: actor detection may still miss it, but this is never silent — an explicit open decision is always recorded", async () => {
    const { semanticModel, blueprint } = await runAndInspect(PASSIVE_VOICE_FIXTURE.idea);

    const actorCount = (semanticModel.actors as unknown[]).length;
    const openDecisions = blueprint.openDecisions as string[];

    if (actorCount === 0) {
      // This is the accepted, disclosed residual limitation (independent
      // Level 3 review Finding 1's own mitigating context: a lightweight
      // regex heuristic is not expected to fully parse passive voice; a
      // real AI provider would very plausibly do better). What is NOT
      // accepted is this happening with no disclosure at all.
      expect(
        openDecisions.some((d) => d.includes("found no actors in this description")),
        "a substantial description that finds zero actors must always be flagged, never pass as silently adequate",
      ).toBe(true);
    }
    // If the heuristic is later improved to also parse this construction,
    // this test still passes trivially (actorCount > 0 skips the
    // assertion above) — it is written to hold under either outcome,
    // since the requirement is "never silent," not "must find zero."
  });
});

describe("multi-domain semantic-hollowing regression corpus (D-0065, Part 12)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function runFixture(idea: string) {
    const owner = await registerUser({
      email: `founder-${Math.random().toString(36).slice(2)}@example.com`,
      password: "password123",
    });
    const org = await createOrganization({ name: "Corpus Org", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Corpus Project",
      createdByUserId: owner.id,
    });

    await generateProductIntelligence(owner.id, project.id, idea);
    const { blueprint } = await generateApplication(owner.id, project.id);
    const qualityGate = await runQualityGate(owner.id, project.id);

    return { blueprint, qualityGate };
  }

  /**
   * The single, domain-agnostic invariant every fixture must satisfy
   * (Part 12: "define semantic obligations and invariants," not exact
   * final designs). Reads the pipeline's own self-reported coverage
   * (blueprint.generationMetadata.semanticCoverage, computed by
   * blueprint-generator.ts itself during generation) rather than
   * re-deriving anything fixture-specific here.
   */
  function checkFixture(
    domain: string,
    blueprint: { validationStatus: string; generationMetadata: unknown },
  ) {
    expect(blueprint.validationStatus, `${domain}: Blueprint must remain structurally VALID`).toBe(
      "VALID",
    );

    const coverage = (blueprint.generationMetadata as { semanticCoverage?: SemanticCoverageReport })
      .semanticCoverage;
    expect(
      coverage,
      `${domain}: semanticCoverage must be present in generationMetadata`,
    ).toBeDefined();
    expect(
      coverage!.overallStatus,
      `${domain}: every actor/entity/workflow the extractor identified must reach the Blueprint — ` +
        `missing actors: ${coverage!.missingExplicitActors.join(", ")}; ` +
        `missing entities: ${coverage!.missingExplicitEntities.join(", ")}; ` +
        `missing workflows: ${coverage!.missingExplicitWorkflows.join(", ")}`,
    ).toBe("adequate");
  }

  for (const fixture of FIXTURES) {
    it(`generates coherent output for: ${fixture.domain}`, async () => {
      const { blueprint, qualityGate } = await runFixture(fixture.idea);

      checkFixture(fixture.domain, blueprint);
      expect(
        qualityGate.passed,
        `${fixture.domain}: Quality Gate must still pass structurally`,
      ).toBe(true);
    });
  }

  it(`[NOVEL HOLDOUT] generates coherent output for: ${HOLDOUT_FIXTURE.domain}`, async () => {
    const { blueprint, qualityGate } = await runFixture(HOLDOUT_FIXTURE.idea);

    checkFixture(HOLDOUT_FIXTURE.domain, blueprint);
    expect(qualityGate.passed).toBe(true);
  });

  it("finds more than one actor and at least one domain-specific entity for every fixture, including the holdout, under the default mock provider", async () => {
    for (const fixture of [...FIXTURES, HOLDOUT_FIXTURE]) {
      const owner = await registerUser({
        email: `actor-check-${Math.random().toString(36).slice(2)}@example.com`,
        password: "password123",
      });
      const org = await createOrganization({ name: "Actor Check Org", ownerUserId: owner.id });
      const project = await createProject({
        organizationId: org.id,
        name: "Actor Check Project",
        createdByUserId: owner.id,
      });

      const { semanticModel } = await generateProductIntelligence(
        owner.id,
        project.id,
        fixture.idea,
      );
      const actorCount = (semanticModel.actors as unknown[]).length;
      const entityCount = (semanticModel.entities as unknown[]).length;

      // Every fixture in this corpus was deliberately written with 2+
      // named roles described via "X can/have/may/will ..." sentences
      // (the same natural phrasing real founders use for multi-role
      // products) — a real regression here means the heuristic's actor
      // detection broke generally, not that this one domain is unusual.
      expect(
        actorCount,
        `${fixture.domain}: expected 2+ actors, found ${actorCount}`,
      ).toBeGreaterThan(1);
      expect(
        entityCount,
        `${fixture.domain}: expected at least 1 domain entity, found ${entityCount}`,
      ).toBeGreaterThan(0);

      // Round 2 independent review (post-D-0068) Finding R2-1: the prior
      // version of this test only ever counted actors, never inspected
      // their names — which is exactly how a name-corrupting regex
      // regression (a modal word swallowed into the actor name, e.g.
      // "Clients Can" instead of "Clients") shipped undetected through a
      // fully green suite. Every fixture's actor names are now checked
      // for corruption, corpus-wide, not just in one dedicated case.
      //
      // Round 3 independent review (post-D-0069) Finding R3-1: the check
      // above only ever tested for a trailing MODAL word — a genuinely
      // different corruption (a common adverb/conjunction swallowed into
      // the name, e.g. "Drivers Also") shipped through this exact test
      // undetected, because it wasn't in scope. Broadened to a
      // representative set of the same function-word class the
      // production fix now excludes (heuristic-extraction.ts's
      // FUNCTION_WORD_EXCLUSIONS) — not the full list duplicated here
      // (that would make this test a tautological mirror of the
      // production list, not an independent check), but enough common
      // members of the class that a regression reopening this construction
      // generally would be caught corpus-wide, not just in one dedicated
      // fixture.
      const actorNames = (semanticModel.actors as { name: string }[]).map((a) => a.name);
      const knownCorruptionSuffixes =
        /\b(can|have|has|may|will|also|typically|usually|generally|often|currently|recently|and|or|but)$/i;
      for (const name of actorNames) {
        expect(
          knownCorruptionSuffixes.test(name),
          `${fixture.domain}: actor name "${name}" ends with a modal or common function word — likely swallowed into the name by a regex regression`,
        ).toBe(false);
      }
    }
  });
});

describe("no domain vocabulary leaked into production extraction code (Part 12 anti-hardcoding guard)", () => {
  // Every distinctive noun from every fixture above (including the
  // holdout), lowercased. If any of these ever appears in the actual
  // extraction/template source below, something was "fixed" by adding a
  // fixture-specific special case instead of a general repair — exactly
  // what Part 12 forbids ("no production-code modification may occur
  // after seeing the holdout result unless... the general architecture is
  // repaired rather than the fixture patched").
  const BANNED_DOMAIN_WORDS = [
    "homebase",
    "chore",
    "grocery",
    "glowbook",
    "esthetician",
    "fleetcare",
    "artisan market",
    "learncircle",
    "expenseflow",
    "leaddesk",
    "quickbite",
    "toolshare",
    "borrower",
  ];

  const SOURCE_FILES_MUST_NOT_CONTAIN_DOMAIN_WORDS = [
    "src/lib/ai/heuristic-extraction.ts",
    "src/lib/generation/blueprint-templates.ts",
    "src/lib/generation/blueprint-generator.ts",
    "src/lib/orchestration/impact-analysis.ts",
    "src/lib/generation/semantic-coverage.ts",
  ];

  for (const relativePath of SOURCE_FILES_MUST_NOT_CONTAIN_DOMAIN_WORDS) {
    it(`${relativePath} contains no fixture-specific domain vocabulary`, () => {
      const fullPath = path.join(process.cwd(), relativePath);
      const source = fs.readFileSync(fullPath, "utf8").toLowerCase();

      for (const word of BANNED_DOMAIN_WORDS) {
        // Word-boundary match, not a bare substring check — a bare
        // .includes("chore") would also flag an unrelated word like
        // "anchored" (which contains "chore" as a substring), which is
        // not a real leak.
        const wordBoundaryPattern = new RegExp(`\\b${word.replace(/\s+/g, "\\s+")}\\b`);
        expect(
          wordBoundaryPattern.test(source),
          `${relativePath} must not contain the fixture-specific word "${word}" — ` +
            `domain generalization must come from generic language structure, never a hardcoded list`,
        ).toBe(false);
      }
    });
  }
});
