# Customer Experience Audit — Pre-Phase-3 Forensic Audit (Part 9)

Grounded in: live e2e traversal this session (`golden-path.spec.ts`, `example-idea-picker.spec.ts`, `launch-actions.spec.ts`, `generation-preview.spec.ts`, `official-demonstration.spec.ts`, `pwa-output.spec.ts`, all passing) plus a direct read of `src/app/org/[orgSlug]/[projectSlug]/page.tsx` (596 lines) and the landing/auth/onboarding pages. Not a literal fresh manual click-through beyond what these tests exercise — findings below are traced to specific evidence, not general impression.

## What a first-time customer actually experiences (verified path)

Landing page → "Get started" → sign-up (name/email/password, real validation) → onboarding (workspace name) → project creation → idea entry. This exact path is live-verified, real, and clean — no dead ends, no unhandled errors, confirmed by `golden-path.spec.ts` passing.

**Idea entry, post-repair**: the customer now sees real example chips ("Build a premium booking app for mobile detailers.", etc.) above the textarea, can click/tab-to/tap one, edit it further, and submit. If they submit something too short (<10 characters), they get a real, specific error message and their exact text is preserved — not a silent no-op (which was the _previous_ behavior: submitting blank text before this session's repair simply redirected back with zero feedback, as if the button hadn't done anything).

**Trust section**: the Studio page's "Trust" section (verified by direct read) lists every Truth Status entry generically with a status badge, and — as of this session's repair — now also shows each entry's `rationale` text. This means a customer running Quality Gate or Store Readiness now sees _why_ something is blocked, not just a bare "Blocked" badge. This is a genuine, material UX improvement traced to real code (previously the rationale field existed in the data model but was never rendered).

## Findings, classified

**DEFECT** — _(fixed this session, listed for completeness of the audit trail)_: submitting a blank/near-blank idea previously produced zero customer-visible feedback. **Status: resolved** in the uncommitted repair (`studio-actions.ts` minimum-length validation).

**CUSTOMER-RISK FINDING** — Generated products' own end users cannot actually log in (Part 4/6). A customer who successfully generates a "booking app for barbers" and shows it to _their own_ customers has nothing resembling real customer accounts yet — only the Pocket Studio builder, authenticated as themselves, can view the preview. This is disclosed in code comments but is not obviously surfaced to the customer in the Studio UI itself (I did not find a Trust Status entry or UI copy specifically saying "your generated app's own login does not work yet" — it's implied by `output.web` rationale text at best). **Recommend**: an explicit, plain-language customer-facing statement of this limitation before Phase 3 adds anything that could make this ambiguity worse (e.g. a "share preview link" feature that a customer might reasonably assume gates behind real customer login).

**CUSTOMER-RISK FINDING** — Content shallowness vs. customer expectation (Part 5). A customer describing a rich domain gets a real, honest, but generic result (Home/Browse-style screens, generic data models) with no proactive UI warning that their specific domain vocabulary (barbers, availability, memberships) didn't survive into the generated screens. The Trust section would show `IMPLEMENTED` for `generation.full_stack_web_app` (post-repair) even when the _content_ is far shallower than what was described — accurate at the mechanism level, potentially misleading at the perceived-value level. This is the same class of gap D-0028/D-0039 already named for the official demonstration product, just not yet generalized into customer-facing UI copy for _every_ idea, not only the one official example.

**UNDERBUILDING** — No "Operate" surface (§6 Simple Mode's sixth section) exists at all — confirmed absent by direct inspection, and honestly disclosed in `execution/state.json`'s known limitations. A returning customer has no dashboard-style view of "how is my generated product doing" — reasonable, since there is no live/deployed product to report on yet, but worth naming as a real, not-yet-addressed customer journey gap for Phase 3.

**UNDERBUILDING** — No axe-core or equivalent automated accessibility verification exists (Part 8). Manual ARIA attributes are present and reasonable where checked, but "correct accessibility semantics" is currently an assertion, not a continuously-verified property.

**IMPROVEMENT** — Quality Gate and Store Readiness results are only reachable by clicking a button on the Studio page and reading the resulting Trust-section text; there is no dedicated results view showing the full list of individual checks (structural/behavioral/accessibility/governance/operational, post-repair) — a customer sees the aggregate pass/fail and a rationale string, not a itemized breakdown. This is a real, minor usability gap, not a defect (the underlying data exists and is real; it's a presentation limitation).

**DEFERRED, correctly** — Mobile output, Store Readiness `READY`, legal-document coverage beyond 3/13 types, and live billing are all explicitly and honestly represented as not-yet-available in the Studio UI (Store Readiness's `readinessStatus` is architecturally incapable of ever showing `READY` today, and the Trust section shows this plainly via rationale text). No customer-facing overstatement was found in the UI copy read this session.

## What a skeptical customer would ask, and whether the product answers it

- _"What do I get right now?"_ — Answered honestly: the Trust section, post-repair, shows real rationale text for every claim, not just a badge.
- _"Can my customers actually use this?"_ — **Not clearly answered in-product.** The generated-app-authentication gap (see above) is a real thing a skeptical customer would eventually discover the hard way (trying to have a friend log into their generated booking app and finding no real login exists) rather than being told upfront.
- _"Why did my idea produce so little?"_ — **Not clearly answered in-product** for ideas other than the one officially-documented example. The mechanism is honest (never claims more than it does), but doesn't proactively explain the content-narrowness gap to a general customer.
- _"Is this ready to launch?"_ — Answered honestly via Store Readiness (always `NOT_READY` with real, itemized reasons) and the Trust section generally — this is one of the strongest, most honestly-built parts of the customer experience.
