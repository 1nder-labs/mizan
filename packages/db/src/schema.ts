/**
 * Domain schema for Mizan: the five core tables that drive campaign review.
 *
 * FK deferral note: `cases.created_by` and `reviewer_actions.reviewer_id`
 * are plain `text().notNull()` columns in this file. U6 wraps them with
 * `.references(() => users.id, { onDelete: "restrict" })` after
 * `auth.schema.ts` is generated and the merged barrel composes both schemas.
 * All other foreign keys are declared here with their cascade/restrict strategy.
 *
 * `$defaultFn(() => crypto.randomUUID())` runs at insert time inside the
 * Cloudflare Worker, which exposes the Web Crypto API globally. The
 * `WebWorker` TypeScript lib (added in this package's `tsconfig.json`) provides
 * the matching ambient `crypto` typing — the same approach used by
 * `apps/worker/tsconfig.json`.
 */

import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Minimal placeholder — Phase 2 expands with extracted_claims, missing_docs, etc. */
type BriefPayload = Record<string, unknown>;

/** Minimal placeholder — Phase 2 expands with signal-specific evidence fields. */
type SignalPayload = Record<string, unknown>;

export const cases = sqliteTable(
  "cases",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    status: text("status", {
      enum: [
        "DRAFT",
        "QUEUED",
        "RUNNING",
        "SUSPENDED_HITL",
        "READY_FOR_REVIEW",
        "ACTIONED",
      ] as const,
    })
      .notNull()
      .default("DRAFT"),
    category: text("category").notNull(),
    geography: text("geography").notNull(),
    claimed_zakat_category: text("claimed_zakat_category"),
    current_run_id: text("current_run_id"),
    brief_partial_json: text("brief_partial_json", {
      mode: "json",
    }).$type<Record<string, unknown>>(),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    created_by: text("created_by").notNull(),
  },
  (table) => [
    index("cases_status_updated_idx").on(table.status, table.updated_at),
    index("cases_created_by_idx").on(table.created_by),
  ],
);

export const briefs = sqliteTable(
  "briefs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    case_id: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    run_id: text("run_id").notNull(),
    recommendation: text("recommendation", {
      enum: [
        "READY_FOR_REVIEW",
        "REQUEST_DOCS",
        "ESCALATE",
        "BLOCK",
      ] as const,
    }).notNull(),
    confidence: integer("confidence").notNull(),
    composed_at: integer("composed_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    payload_json: text("payload_json", { mode: "json" })
      .$type<BriefPayload>()
      .notNull(),
  },
  (table) => [
    index("briefs_case_id_idx").on(table.case_id),
    index("briefs_run_id_idx").on(table.run_id),
  ],
);

export const signals = sqliteTable(
  "signals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    case_id: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    run_id: text("run_id").notNull(),
    signal_type: text("signal_type", {
      enum: [
        "photo_dup",
        "story_coherence",
        "vouching_chain",
        "registry_lookup",
        "sanctions_screen",
        "ocr_mismatch",
      ] as const,
    }).notNull(),
    payload_json: text("payload_json", { mode: "json" })
      .$type<SignalPayload>()
      .notNull(),
    recorded_at: integer("recorded_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("signals_case_run_idx").on(table.case_id, table.run_id)],
);

export const reviewer_actions = sqliteTable(
  "reviewer_actions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    case_id: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "restrict" }),
    run_id: text("run_id").notNull(),
    reviewer_id: text("reviewer_id").notNull(),
    action: text("action", {
      enum: [
        "APPROVE",
        "ESCALATE",
        "REQUEST_DOCS",
        "BLOCK",
        "OVERRIDE",
      ] as const,
    }).notNull(),
    rationale: text("rationale").notNull(),
    acted_at: integer("acted_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    action_id: text("action_id").notNull().unique(),
  },
  (table) => [
    index("reviewer_actions_case_id_idx").on(table.case_id),
    uniqueIndex("reviewer_actions_action_id_idx").on(table.action_id),
  ],
);

export const workflow_events = sqliteTable(
  "workflow_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    case_id: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "restrict" }),
    run_id: text("run_id").notNull(),
    seq: integer("seq").notNull(),
    event_type: text("event_type", {
      enum: [
        "step.start",
        "step.finish",
        "step.suspend",
        "step.resume",
        "workflow.finish",
      ] as const,
    }).notNull(),
    step_id: text("step_id"),
    payload_json: text("payload_json", {
      mode: "json",
    }).$type<Record<string, unknown>>(),
    emitted_at: integer("emitted_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("workflow_events_run_seq_idx").on(table.run_id, table.seq),
  ],
);
