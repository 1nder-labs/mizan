/**
 * Domain schema for Mizan: the five core tables that drive campaign review.
 *
 * All foreign keys are now declared. `cases.created_by` and
 * `reviewer_actions.reviewer_id` reference `users.id` from `auth.schema.ts`
 * with `onDelete: "restrict"` — a reviewer action or case must not be deleted
 * when the owning user is removed. All other FK cascade/restrict strategies
 * follow the same principle.
 *
 * `$defaultFn(() => crypto.randomUUID())` runs at insert time inside the
 * Cloudflare Worker, which exposes the Web Crypto API globally. The
 * `WebWorker` TypeScript lib (added in this package's `tsconfig.json`) provides
 * the matching ambient `crypto` typing — the same approach used by
 * `apps/worker/tsconfig.json`.
 */

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization, users } from "./auth.schema.ts";

import type { BriefPayload, CaseOverlay, SignalPayload } from "@mizan/shared";

export type { SignalPayload } from "@mizan/shared";

/**
 * Single source of truth for the `reviewer_actions.action` enum.
 *
 * Drizzle's column type and the shared `ReviewerActionSchema` (HTTP
 * route validation) both reference this tuple so a future enum-value
 * addition lands in one place — and a divergence between the column
 * and the route validator is impossible at compile time.
 */
export const REVIEWER_ACTION_VALUES = [
  "APPROVE",
  "ESCALATE",
  "REQUEST_DOCS",
  "BLOCK",
  "OVERRIDE",
] as const;

export type ReviewerActionValue = (typeof REVIEWER_ACTION_VALUES)[number];

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
        "FAILED",
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
    }).$type<CaseOverlay | null>(),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assigned_to: text("assigned_to").references(() => users.id, { onDelete: "set null" }),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("cases_org_status_updated_idx").on(table.organization_id, table.status, table.updated_at),
    index("cases_org_created_by_idx").on(table.organization_id, table.created_by),
    index("cases_org_assigned_to_idx").on(table.organization_id, table.assigned_to),
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
      enum: ["READY_FOR_REVIEW", "REQUEST_DOCS", "ESCALATE", "BLOCK"] as const,
    }).notNull(),
    confidence: integer("confidence").notNull(),
    composed_at: integer("composed_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    payload_json: text("payload_json", { mode: "json" }).$type<BriefPayload>().notNull(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("briefs_org_case_id_idx").on(table.organization_id, table.case_id),
    index("briefs_org_run_id_idx").on(table.organization_id, table.run_id),
    uniqueIndex("briefs_case_run_uniq").on(table.case_id, table.run_id),
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
    payload_json: text("payload_json", { mode: "json" }).$type<SignalPayload>().notNull(),
    recorded_at: integer("recorded_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
  },
  /**
   * `signals_case_run_type_uniq` is a covering composite index whose
   * leading prefix `(case_id, run_id)` already serves the case+run
   * lookup pattern. A separate `signals_case_run_idx` would only add
   * write-amplification on every upsertSignal call without buying any
   * read path SQLite cannot already satisfy.
   */
  (table) => [
    uniqueIndex("signals_case_run_type_uniq").on(table.case_id, table.run_id, table.signal_type),
    index("signals_org_case_id_idx").on(table.organization_id, table.case_id),
  ],
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
    reviewer_id: text("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action", { enum: REVIEWER_ACTION_VALUES }).notNull(),
    rationale: text("rationale").notNull(),
    acted_at: integer("acted_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    action_id: text("action_id").notNull(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("reviewer_actions_org_case_id_idx").on(table.organization_id, table.case_id),
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
      enum: ["workflow.start", "step.suspend", "step.resume", "workflow.finish"] as const,
    }).notNull(),
    step_id: text("step_id"),
    payload_json: text("payload_json", {
      mode: "json",
    }).$type<Record<string, unknown>>(),
    emitted_at: integer("emitted_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("workflow_events_run_seq_idx").on(table.run_id, table.seq),
    index("workflow_events_org_case_id_idx").on(table.organization_id, table.case_id),
  ],
);

export const live_events = sqliteTable(
  "live_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    topic: text("topic").notNull(),
    seq: integer("seq").notNull(),
    event_type: text("event_type").notNull(),
    payload_json: text("payload_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    organization_id: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    actor_user_id: text("actor_user_id").references(() => users.id),
    emitted_at: integer("emitted_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("live_events_topic_seq_uniq").on(table.topic, table.seq),
    index("live_events_topic_emitted_idx").on(table.topic, table.emitted_at),
  ],
);

export const chat_threads = sqliteTable(
  "chat_threads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("chat_threads_user_org_updated_idx").on(
      table.user_id,
      table.organization_id,
      table.updated_at,
    ),
  ],
);

export const chat_messages = sqliteTable(
  "chat_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    thread_id: text("thread_id")
      .notNull()
      .references(() => chat_threads.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["user", "assistant", "system", "tool"] as const,
    }).notNull(),
    parts_json: text("parts_json", { mode: "json" }).$type<unknown[]>().notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("chat_messages_thread_created_idx").on(table.thread_id, table.created_at)],
);

export const eval_promotions = sqliteTable(
  "eval_promotions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    case_id: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "restrict" }),
    run_id: text("run_id").notNull(),
    action_id: text("action_id")
      .notNull()
      .references(() => reviewer_actions.action_id, { onDelete: "restrict" }),
    recommendation: text("recommendation", {
      enum: ["READY_FOR_REVIEW", "REQUEST_DOCS", "ESCALATE", "BLOCK"] as const,
    }).notNull(),
    reviewer_action: text("reviewer_action", { enum: REVIEWER_ACTION_VALUES }).notNull(),
    promoted_at: integer("promoted_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("eval_promotions_run_action_uniq").on(table.run_id, table.action_id),
    index("eval_promotions_case_id_idx").on(table.case_id),
  ],
);
