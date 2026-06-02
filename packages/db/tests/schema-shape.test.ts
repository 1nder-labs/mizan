/**
 * Schema-shape assertions for Phase 7 tables and indexes.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");

/**
 * Concatenates every generated migration's SQL. Reading the whole set (rather
 * than a pinned filename) keeps these assertions valid across migration
 * squashes / renames — drizzle-generated files are the source, and the index
 * must exist *somewhere* in the applied history.
 */
function allMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    .join("\n");
}

const MIGRATIONS_SQL = allMigrationsSql();

describe("reviewer_actions schema shape", () => {
  it("action_id has a unique index in migrations", () => {
    expect(MIGRATIONS_SQL).toContain("CREATE UNIQUE INDEX `reviewer_actions_action_id_idx`");
    expect(MIGRATIONS_SQL).toContain("(`action_id`)");
  });
});

describe("workflow_events schema shape", () => {
  it("(run_id, seq) has a unique index in migrations", () => {
    expect(MIGRATIONS_SQL).toContain("CREATE UNIQUE INDEX `workflow_events_run_seq_idx`");
    expect(MIGRATIONS_SQL).toContain("(`run_id`,`seq`)");
  });
});

describe("eval_promotions schema shape", () => {
  it("(run_id, action_id) has a unique index in migrations", () => {
    expect(MIGRATIONS_SQL).toContain("CREATE UNIQUE INDEX `eval_promotions_run_action_uniq`");
    expect(MIGRATIONS_SQL).toContain("(`run_id`,`action_id`)");
  });

  it("indexes case_id for admin lookups", () => {
    expect(MIGRATIONS_SQL).toContain("CREATE INDEX `eval_promotions_case_id_idx`");
    expect(MIGRATIONS_SQL).toContain("(`case_id`)");
  });
});
