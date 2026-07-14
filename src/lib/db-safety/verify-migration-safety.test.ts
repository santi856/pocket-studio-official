import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findMigrationSafetyViolations,
  getMigrationAllowedExceptionNames,
} from "./verify-migration-safety";

describe("findMigrationSafetyViolations against the real migration history", () => {
  it("finds zero destructive statements across this project's real migrations — purely additive today (P3-02)", () => {
    expect(findMigrationSafetyViolations()).toEqual([]);
  });

  it("has no allowed exceptions today — none has ever been needed", () => {
    expect(getMigrationAllowedExceptionNames()).toEqual([]);
  });
});

describe("findMigrationSafetyViolations detector correctness (against synthetic fixtures)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function writeFixtureMigration(migrationName: string, sql: string): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-safety-fixture-"));
    const migrationDir = path.join(tempDir, migrationName);
    fs.mkdirSync(migrationDir, { recursive: true });
    fs.writeFileSync(path.join(migrationDir, "migration.sql"), sql);
    return tempDir;
  }

  it("flags DROP TABLE — proves the detector is not vacuous", () => {
    const dir = writeFixtureMigration("20260101000000_bad", 'DROP TABLE "projects";\n');

    const violations = findMigrationSafetyViolations(dir);

    expect(violations).toEqual([
      {
        migration: "20260101000000_bad",
        pattern: "DROP TABLE",
        line: 1,
        statement: 'DROP TABLE "projects";',
      },
    ]);
  });

  it("flags DROP COLUMN", () => {
    const dir = writeFixtureMigration(
      "20260101000000_bad",
      'ALTER TABLE "projects" DROP COLUMN "name";\n',
    );

    expect(findMigrationSafetyViolations(dir)).toHaveLength(1);
  });

  it("flags a forced SET NOT NULL", () => {
    const dir = writeFixtureMigration(
      "20260101000000_bad",
      'ALTER TABLE "projects" ALTER COLUMN "name" SET NOT NULL;\n',
    );

    expect(findMigrationSafetyViolations(dir)).toHaveLength(1);
  });

  it("flags an unconditional DELETE FROM", () => {
    const dir = writeFixtureMigration("20260101000000_bad", 'DELETE FROM "sessions";\n');

    expect(findMigrationSafetyViolations(dir)).toHaveLength(1);
  });

  it("does not flag routine additive statements (CREATE TABLE, CREATE INDEX, ADD COLUMN without NOT NULL)", () => {
    const dir = writeFixtureMigration(
      "20260101000000_good",
      [
        'CREATE TABLE "widgets" (',
        '  "id" TEXT NOT NULL,',
        '  CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")',
        ");",
        'CREATE INDEX "widgets_id_idx" ON "widgets"("id");',
        'ALTER TABLE "projects" ADD COLUMN "note" TEXT;',
      ].join("\n"),
    );

    expect(findMigrationSafetyViolations(dir)).toEqual([]);
  });
});
