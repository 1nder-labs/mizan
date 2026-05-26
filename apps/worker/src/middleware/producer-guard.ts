import { cases, eq, inArray, makeDb, and } from "@mizan/db";
import type { Case } from "@mizan/db";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../env.ts";
import type { RoleVariables } from "./require-role.ts";

/**
 * Source statuses accepted by `producerGuard("RUNNING")` — the Mode A
 * SSE path. Includes READY_FOR_REVIEW / ACTIONED so a reviewer can
 * regenerate a completed brief via streaming. FAILED is included so a
 * pre-stream throw can be retried.
 */
const ALLOWED_RUNNING_SOURCES = ["DRAFT", "READY_FOR_REVIEW", "ACTIONED", "FAILED"] as const;

/**
 * Source statuses accepted by `producerGuard("QUEUED")` — the Mode B
 * background path. Narrower than the Mode A set so `revertQueuedClaim`
 * (which always reverts to DRAFT on send failure) is provably lossless:
 * a successful row (READY_FOR_REVIEW / ACTIONED) cannot be downgraded
 * by an enqueue compensation. DRAFT and FAILED both revert cleanly to
 * DRAFT without losing reviewer-visible state.
 */
const ALLOWED_QUEUED_SOURCES = ["DRAFT", "FAILED"] as const;

export type ProducerTarget = "RUNNING" | "QUEUED";

export type ProducerVariables = RoleVariables & {
  runId: string;
  caseRow: Case;
};

type ProducerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>;

function inFlightResponse(
  c: ProducerContext,
  existing: Case,
  mode: "409" | "replay-202",
): Response {
  if (mode === "replay-202") {
    return c.json(
      {
        status: existing.status,
        run_id: existing.current_run_id,
        replay: true,
      },
      202,
    );
  }
  return c.json({ error: "case_already_running", current_status: existing.status }, 409);
}

function allowedSources(target: ProducerTarget): readonly Case["status"][] {
  return target === "QUEUED" ? ALLOWED_QUEUED_SOURCES : ALLOWED_RUNNING_SOURCES;
}

/**
 * Idempotency Layer 2 — atomic case status transition to RUNNING or QUEUED.
 * Sets c.var.runId + c.var.caseRow on success; 404 / 409 (or 202 replay)
 * on miss / race. The in-flight mode is derived from target:
 * QUEUED → "replay-202", RUNNING → "409". 409 bodies do NOT include the
 * existing runId to avoid leaking a sibling reviewer's run handle.
 */
export const producerGuard = (target: ProducerTarget) => {
  const onInFlight: "409" | "replay-202" = target === "QUEUED" ? "replay-202" : "409";
  const sources = allowedSources(target);
  return createMiddleware<{
    Bindings: CloudflareBindings;
    Variables: ProducerVariables;
  }>(async (c, next) => {
    const caseId = c.req.param("id");
    if (!caseId) return c.json({ error: "case id required" }, 400);

    const db = makeDb(c.env.DB);
    const [existing] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    if (!existing) return c.json({ error: "case not found" }, 404);
    if (existing.status === "QUEUED" || existing.status === "RUNNING") {
      return inFlightResponse(c, existing, onInFlight);
    }
    if (!sources.includes(existing.status)) {
      return c.json({ error: "invalid_source_status", current_status: existing.status }, 409);
    }

    const runId = crypto.randomUUID();
    const updated = await db
      .update(cases)
      .set({ status: target, current_run_id: runId, updated_at: new Date() })
      .where(and(eq(cases.id, caseId), inArray(cases.status, [...sources])))
      .returning();

    if (updated.length === 0) {
      return c.json({ error: "case status race lost" }, 409);
    }

    const row = updated[0];
    if (!row) return c.json({ error: "case status race lost" }, 409);

    c.set("runId", runId);
    c.set("caseRow", row);
    await next();
    return;
  });
};
