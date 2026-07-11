# Review Records

Structure for Review Protocol v1.0 compliance.

- `level1.jsonl` — Level 1 implementation-unit review records (append after each coherent unit).
- `level2.jsonl` — Level 2 milestone review records.
- `level3/` — Level 3 phase-exit adversarial review records, one subdirectory per phase (`phase-1/`, `phase-2/`, `phase-3/`), each containing the independent fresh-context subagent's full report plus its independence-status record (Review Protocol §2).
- `test-integrity.jsonl` — every modification, weakening, skip, disable, deletion, or replacement of an existing test (Review Protocol §6).
- `prior-findings.jsonl` — unresolved and resolved findings carried forward for regression checking before major related work (Review Protocol §8).
- `audit-samples.jsonl` — phase-exit audit of three randomly selected previously resolved findings, re-verified against current repository behavior (Review Protocol §7).

Each record must be evidence-based: affected requirement, evidence reference, severity, impact, recommended action, blocking status, resolution status. No review record is proof a meaningful review occurred merely by existing — findings must cite verifiable repository evidence.
