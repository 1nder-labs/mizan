/**
 * Shared helpers for Mode B integration tests.
 */

import { readFileSync } from "node:fs";
import { env, exports } from "cloudflare:workers";
import { vi } from "vitest";
import { SeedCaseSchema, type CloudflareBindings } from "@mizan/shared";
import { isCloudflareBindings } from "@mizan/mastra/testing";
import { makeTestMessage } from "../helpers/queue-batch.ts";

const BASE = "http://localhost";

export { BASE };

/** Narrows Miniflare `env` to `CloudflareBindings` for direct handler calls. */
export function getTestBindings(): CloudflareBindings {
  if (!isCloudflareBindings(env)) {
    throw new Error("cloudflare test env missing required bindings");
  }
  return env;
}

export function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

export async function seedAdmin(): Promise<{ cookie: string; userId: string }> {
  const email = `mode-b-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Mode B Admin" }),
    }),
  );
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE email = ?").bind(email).run();
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("admin seed failed");
  return { cookie: cookiesFrom(signIn), userId: row.id };
}

export function loadDocumentarySeed(filename: string) {
  const path = new URL(
    `../../../../packages/mastra/src/seeds/documentary/${filename}`,
    import.meta.url,
  ).pathname;
  return SeedCaseSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export async function insertDraftCase(
  caseId: string,
  reviewerId: string,
  filename = "case-001.json",
): Promise<void> {
  const seed = loadDocumentarySeed(filename);
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, created_at, updated_at)
     VALUES (?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
  )
    .bind(
      caseId,
      seed.category,
      seed.geography,
      seed.claimed_zakat_category,
      JSON.stringify({
        story: seed.story,
        organizer_name: seed.organizer_name,
        r2_keys: seed.r2_keys,
      }),
      reviewerId,
      Date.now(),
      Date.now(),
    )
    .run();
}

export async function putSeedAssets(filename = "case-001.json"): Promise<void> {
  const seed = loadDocumentarySeed(filename);
  const { MINIMAL_PNG_BYTES } = await import("../fixtures/minimal-png.ts");
  await env.R2_BUCKET.put(seed.r2_keys.creator_id, MINIMAL_PNG_BYTES);
  await env.R2_BUCKET.put(seed.r2_keys.bank_statement, MINIMAL_PNG_BYTES);
  await env.R2_BUCKET.put(seed.r2_keys.category_doc, MINIMAL_PNG_BYTES);
}

/** Return type for a tracked queue message with accessible spy references. */
export type TrackedMessage<T> = {
  message: ReturnType<typeof makeTestMessage>;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  body: T;
};

/**
 * Builds a `makeTestMessage` wrapper with accessible `ack` and `retry` spies.
 * Single source of truth for tracked-message construction across Mode B tests.
 * `attempts` defaults to 1 (first delivery); pass `>= 2` to exercise
 * crash-recovery code paths in the consumer.
 */
export function trackedMessage<T>(body: T, opts?: { attempts?: number }): TrackedMessage<T> {
  const ack = vi.fn();
  const retry = vi.fn();
  const messageOpts: { ack: () => void; retry: () => void; attempts?: number } = { ack, retry };
  if (opts?.attempts !== undefined) messageOpts.attempts = opts.attempts;
  const message = makeTestMessage(body, messageOpts);
  return { message, ack, retry, body };
}

/** Accepted status values for `seedCaseStatus`. */
type CaseStatus =
  | "DRAFT"
  | "QUEUED"
  | "RUNNING"
  | "READY_FOR_REVIEW"
  | "ACTIONED"
  | "FAILED"
  | "SUSPENDED_HITL";

/**
 * Updates a case row's `status` (and optionally `current_run_id`,
 * `updated_at`) directly in the test DB. Centralises raw-SQL status
 * writes across Mode B integration tests. `updatedAt` is exposed so
 * staleness-gated crash-recovery tests can simulate a row whose owning
 * consumer has been silent past the staleness threshold.
 */
export async function seedCaseStatus(args: {
  caseId: string;
  status: CaseStatus;
  runId?: string;
  updatedAt?: number;
}): Promise<void> {
  const updatedAt = args.updatedAt ?? Date.now();
  if (args.runId !== undefined) {
    await env.DB.prepare(
      "UPDATE cases SET status = ?, current_run_id = ?, updated_at = ? WHERE id = ?",
    )
      .bind(args.status, args.runId, updatedAt, args.caseId)
      .run();
  } else {
    await env.DB.prepare("UPDATE cases SET status = ?, updated_at = ? WHERE id = ?")
      .bind(args.status, updatedAt, args.caseId)
      .run();
  }
}
