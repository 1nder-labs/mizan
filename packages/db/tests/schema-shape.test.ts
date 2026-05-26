/**
 * Schema-shape assertions for Phase 7 tables and indexes.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
}

describe("reviewer_actions schema shape", () => {
  it("action_id has a unique index in migrations", () => {
    const sql = readMigration("0000_black_princess_powerful.sql");
    expect(sql).toContain("CREATE UNIQUE INDEX `reviewer_actions_action_id_idx`");
    expect(sql).toContain("(`action_id`)");
  });
});

describe("workflow_events schema shape", () => {
  it("(run_id, seq) has a unique index in migrations", () => {
    const sql = readMigration("0000_black_princess_powerful.sql");
    expect(sql).toContain("CREATE UNIQUE INDEX `workflow_events_run_seq_idx`");
    expect(sql).toContain("(`run_id`,`seq`)");
  });
});

describe("eval_promotions schema shape", () => {
  it("(run_id, action_id) has a unique index in migrations", () => {
    const sql = readMigration("0004_funny_robbie_robertson.sql");
    expect(sql).toContain("CREATE UNIQUE INDEX `eval_promotions_run_action_uniq`");
    expect(sql).toContain("(`run_id`,`action_id`)");
  });

  it("indexes case_id for admin lookups", () => {
    const sql = readMigration("0004_funny_robbie_robertson.sql");
    expect(sql).toContain("CREATE INDEX `eval_promotions_case_id_idx`");
    expect(sql).toContain("(`case_id`)");
  });
});
