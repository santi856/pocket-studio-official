import fs from "node:fs";
import path from "node:path";

export type MigrationSafetyViolation = {
  migration: string;
  pattern: string;
  line: number;
  statement: string;
};

// Patterns that are safe (routine, purely additive) in Phase 1/2's own
// history — CREATE TABLE/INDEX/etc. — are simply never matched below.
// These are the ones that can destroy data or break an existing row set if
// applied against a populated production table, which is exactly the risk
// Phase 3's "production database" requirement (Master Spec §61) exists to
// guard against, now that real customer data becomes possible.
const DESTRUCTIVE_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: "DROP TABLE", regex: /\bDROP\s+TABLE\b/i },
  { name: "DROP COLUMN", regex: /\bDROP\s+COLUMN\b/i },
  { name: "TRUNCATE", regex: /\bTRUNCATE\b/i },
  { name: "SET NOT NULL", regex: /\bALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b/i },
  { name: "unconditional DELETE", regex: /\bDELETE\s+FROM\b/i },
  { name: "DROP DATABASE", regex: /\bDROP\s+DATABASE\b/i },
];

// Every entry here must name a real migration and explain, specifically,
// why the destructive statement it contains is actually safe (e.g. the
// column was never populated, or the table was created and dropped within
// the same still-unreleased migration) — this list exists to force that
// justification into the open, not to silence the check.
const ALLOWED_EXCEPTIONS: ReadonlyMap<string, string> = new Map();

function collectMigrationFiles(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(migrationsDir, entry.name, "migration.sql"))
    .filter((file) => fs.existsSync(file));
}

/** Exposed so tests can assert the exception list stays exactly what was reviewed, not silently grown. */
export function getMigrationAllowedExceptionNames(): string[] {
  return [...ALLOWED_EXCEPTIONS.keys()].sort();
}

/**
 * Scans every applied migration under `prisma/migrations` for SQL
 * statements that are destructive against a table that could already hold
 * real rows (dropped tables/columns, forced NOT NULL without a backfill,
 * unconditional deletes, truncation). This project's migration history is
 * purely additive today (verified: zero matches across all 17 migrations,
 * P3-02) — this tool exists so that stays true as Phase 3 adds real
 * production data to protect, rather than being re-verified by hand each
 * phase.
 */
export function findMigrationSafetyViolations(
  migrationsDir = path.resolve(process.cwd(), "prisma/migrations"),
): MigrationSafetyViolation[] {
  const violations: MigrationSafetyViolation[] = [];

  for (const file of collectMigrationFiles(migrationsDir)) {
    const migrationName = path.basename(path.dirname(file));
    if (ALLOWED_EXCEPTIONS.has(migrationName)) continue;

    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((lineText, index) => {
      for (const { name, regex } of DESTRUCTIVE_PATTERNS) {
        if (regex.test(lineText)) {
          violations.push({
            migration: migrationName,
            pattern: name,
            line: index + 1,
            statement: lineText.trim(),
          });
        }
      }
    });
  }

  return violations.sort((a, b) => a.migration.localeCompare(b.migration) || a.line - b.line);
}
