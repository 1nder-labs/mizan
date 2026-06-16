---
title: Cloudflare Queues — durable brief executor (queue consumer) engineering patterns
date: 2026-05-24
last_updated: 2026-06-15
category: best-practices
module: queue_system
problem_type: best_practice
component: queue_system
severity: high
applies_when:
  - "Building a Cloudflare Queues consumer on Workers as the durable executor for a long job"
  - "Running a Mastra workflow from a queue consumer (the SOLE execution path)"
  - "Implementing Layer 3 idempotent redelivery on at-least-once delivery"
  - "Reasoning about ack/retry/DLQ + status-machine guarantees"
  - "Pairing a queue executor with a Durable Object resumable-stream store"
tags:
  - cloudflare-queues
  - cloudflare-workers
  - hono
  - mastra
  - idempotency
  - state-machine
  - drizzle
  - d1
---

# Cloudflare Queues — durable brief executor (queue consumer) engineering patterns

Load-bearing patterns for the brief queue consumer — the **sole executor** of the
brief workflow. Each was settled after a brutal multi-agent review surfaced a
real bug; the failure mode is documented under each pattern so future work can
recognise the same shape early.

> **Architecture update (2026-06-15).** The old two-mode design (Mode A =
> `run.stream()` inside the SSE handler; Mode B = enqueue + 202; selected by
> `Accept`-header content negotiation) is GONE. There is now **one durable
> path**: the queue consumer owns all execution + persistence, and a per-`runId`
> Durable Object (`BriefStreamDO`) is the resumable-stream STORE the reviewer
> subscribes to. `POST /:id/brief` always returns `200 text/event-stream`. See
> the companion doc
> `docs/solutions/architecture-patterns/durable-resumable-brief-stream-do.md`
> for the store/executor split, the unified producer guard, and the
> stuck-RUNNING root cause (`run.stream()` resolves `{status:'failed'}` without
> throwing — the consumer MUST inspect `stream.result.status` and throw on
> non-OK). The patterns below are the executor + DLQ + D1 engineering that path
> still relies on.

## 1. One durable path: the queue consumer is the sole executor

There is no content negotiation and no Mode A. `POST /:id/brief` runs the unified
`briefProducerGuard`, then `startBriefRun`: a fresh claim enqueues a
`BriefQueueMessage` and returns the DO subscription; an in-flight rejoin just
returns the DO subscription. Either way the response is `200 text/event-stream`.
The Hono middleware chain (role gate, idempotency key, `aiDailyCap`, producer
guard) is shared by the single route.

The executor (queue consumer) is what makes the brief survive a client
disconnect: it runs `run.stream()`, relays each SSE chunk to the DO, and
finishes the DO only on a terminal outcome. Execution is never coupled to the
HTTP connection.

**Failure mode caught (historical)**: coupling `run.stream()` to the SSE handler
(old Mode A) — a client disconnect tore down the Workers execution context
mid-workflow and stranded the case in `RUNNING` forever.

## 2. Unified producer guard, keyed only on current status

A single `briefProducerGuard` (no per-target factory, no `Accept` branch)
decides by the case's current status:

| Current status                          | Action                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DRAFT`, `FAILED`                       | **Claim** a fresh `runId`, enqueue (`replay=false`). `ALLOWED_SOURCES = [DRAFT, FAILED]` |
| `QUEUED`, `RUNNING`                     | **Rejoin** — subscribe to the in-flight run's DO (`replay=true`, no enqueue, no 409)     |
| `ACTIONED`, `SUSPENDED_HITL` (terminal) | **409 `invalid_source_status`** — the decision is made; cannot re-brief                  |
| cross-org                               | **404**                                                                                  |

Restricting claim sources to `DRAFT`/`FAILED` makes the `revertQueuedClaim`
compensation (pattern #6) **provably lossless** — a successful row cannot be
downgraded by an enqueue compensation. "Rejoin" is what makes a second POST (or
a reconnect) on an in-flight case safe — it re-subscribes to the same DO rather
than minting a new run. Terminal-409 keeps the UI honest: an ACTIONED case must
NOT render a "Generate" button (it would 409-loop).

**Failure mode caught**: a per-target `RUNNING` claim source list including
`ACTIONED`/`READY_FOR_REVIEW` — re-briefing a decided case. The `RUNNING`-target
path (`claimCaseRunning`) was deleted as dead code when the guard unified.

## 3. Crash recovery on RUNNING: three-way split — ack, retry, or claim

Cloudflare Queues delivers messages at-least-once. A redelivery against a row already in `RUNNING` has three causes that aren't distinguishable by row state alone:

1. **Concurrent duplicate (first delivery)** — another consumer is running right now. Ack.
2. **Fresh redelivery while RUNNING** — either a slow workflow still alive, or a recent crash. **Cannot ack** (would orphan the row if it was a crash) and **cannot claim** (would double-execute against a live consumer). Tell the queue to retry.
3. **Stale redelivery while RUNNING** — row hasn't been touched for longer than `RUNNING_STALE_THRESHOLD_MS = 10 * 60 * 1000` (safely past the 5-min Workers paid-plan wall-time cap). Crash proven; reclaim.

```ts
case "RUNNING":
  if (attempts === 1) return "ack-running";
  return isStaleClaim(row, time) ? "claim" : "retry-running";
```

Consumer mapping:

```ts
if (action === "retry-running") {
  msg.retry();
  return;
}
if (action !== "claim") {
  msg.ack();
  return;
}
// claim path...
```

This gives a defence in depth:

- Single-delivery duplicates ack immediately.
- A fresh redelivery enters Cloudflare's retry loop (`retry_delay: 30`, `max_retries: 3`). One of three things happens within the retry window:
  - The original consumer finishes naturally → row leaves RUNNING → next redelivery acks via `ack-terminal`.
  - The row stales past the threshold → next redelivery reclaims via `claim`.
  - Max retries exhaust → DLQ → DLQ consumer flips to FAILED → producer retry mints a fresh runId via `producerGuard`.
- A stale redelivery skips the retry loop entirely and reclaims immediately.

The atomic `claimRun` UPDATE (`status IN ('QUEUED','RUNNING') AND current_run_id = ?`) is the mutex; the staleness gate is the gate against racing a live consumer; Mastra's runId-keyed D1 persistence is the deepest backstop.

**Cloudflare Queues note**: push consumers (the `queue(batch, env, ctx)` handler) do NOT expose `visibility_timeout_seconds` in `wrangler.jsonc` — that knob is pull-consumer only. For push consumers, redelivery is governed by Worker wall-time + `max_retries`. The row-staleness check plus the retry-running mapping together implement the application-level equivalent of a visibility timeout.

**FAILED is terminal for this runId.** The DLQ flips QUEUED/RUNNING → FAILED. A redelivery for the SAME runId is stale wire — ack-terminal. Producer retry mints a fresh runId via `producerGuard`, so a legitimate retry never re-uses a FAILED runId.

**Failure modes caught**:

1. Blanket `ack-running` for ALL RUNNING redeliveries → fresh-crash redelivery is lost → row stuck RUNNING forever, never reaches DLQ.
2. Blanket `claim` for RUNNING redeliveries → slow workflows trigger double execution.
3. FAILED in claim sources → DLQ flip can be undone by a stale main-queue message before the DLQ consumer fires.
4. `ack-running` collapsed with `retry-running` into one verb → consumer can't tell which side-effect is needed → footgun (#1's first incarnation).

## 4. Exhaustive switch + `assertNever` on the status enum

Status classification fans out by `row.status`. An exhaustive switch over the literal enum union with an `assertNever` default surfaces enum additions as **compile errors** rather than silent acks.

```ts
switch (row.status) {
  case "ACTIONED":
  case "SUSPENDED_HITL":
  case "FAILED":
    return "ack-terminal";
  case "RUNNING":
    if (attempts === 1) return "ack-running";
    return isStaleClaim(row, time) ? "claim" : "retry-running";
  case "QUEUED":
    return "claim";
  case "DRAFT":
    console.error("brief queue orphaned DRAFT row", { caseId: row.id, runId });
    return "ack-mismatch";
  default:
    return assertNever(row.status, { caseId: row.id, runId });
}
```

`SUSPENDED_HITL` is handled explicitly — the queue path doesn't own resume, but **must** not poison the workflow if a redelivery races a HITL suspend.

**Failure mode caught**: a default-fallthrough that silently acks unknown statuses → any new enum value added later silently breaks queue idempotency without any compile-time signal.

## 5. Shared workflow bootstrap helper (`createBriefRun`)

The queue consumer boots each run through one helper: per-request Mastra instance, workflow resolution, runId-pinned run creation, runtime context, env/ctx propagation. Centralising it means a change to Mastra's RequestContext shape or ENV-key wiring touches one place.

```ts
export async function createBriefRun(env, input) {
  const ctx = buildBriefRunContext(env, input);
  const { mastra, langfuse } = createMastra(env);
  const workflow = mastra.getWorkflow("brief");
  const run = await workflow.createRun({ runId: input.runId });
  const requestContext = makeRuntimeContext(ctx);
  requestContext.set(MIZAN_ENV_KEY, env);
  return { langfuse, run, requestContext, tracingOptions };
}
```

`MIZAN_CTX_KEY` is already set by `makeRuntimeContext`; don't re-set it here. Return only the fields the consumer uses; `mastra` + `ctx` are internal and stay private.

The consumer uses `run.stream()` (NOT `run.start()`) so it can relay live SSE to the DO, then **awaits `stream.result` and throws on a non-OK status** (only `success`/`suspended` are clean). Mastra resolves a failed run with `{status:'failed'}` rather than throwing — without the status gate a failed step would ack + strand the case in RUNNING. This is the load-bearing executor invariant; see the companion architecture doc.

**Failure mode caught**: any change to Mastra's RequestContext shape, ENV key wiring, or runId pinning requires touching every call site — eventually one is missed.

## 6. Compensation must be guarded by the state it expects

The compensation `revertQueuedClaim` flips `QUEUED → DRAFT` when `BRIEF_QUEUE.send` throws. The `WHERE` clause **must** filter on `status = 'QUEUED'`:

```ts
.where(and(
  eq(cases.id, caseId),
  eq(cases.current_run_id, runId),
  eq(cases.status, "QUEUED"),
));
```

If a concurrent consumer atomically claimed the row to `RUNNING` (or DLQ flipped it to `FAILED`) in the millisecond window between `producerGuard` claiming `QUEUED` and `BRIEF_QUEUE.send` throwing, the revert must be a **no-op** — the row is no longer ours to revert.

Same principle for the consumer's own `revertClaim` (`RUNNING → QUEUED` on a retryable workflow failure): the `from: "RUNNING"` guard preserves a row a concurrent path already advanced.

**Failure mode caught**: a compensation with no state guard regresses a completed brief to DRAFT under racy schedules.

## 7. Schema parse and side-effect must share one try block

The producer constructs the queue message body, parses it, sends to the queue, then returns the DO subscription (200 SSE). The parse + send **must** be inside the same try/catch that calls `revertQueuedClaim` on throw:

```ts
try {
  const message = BriefQueueMessageSchema.parse({ ... });
  await c.env.BRIEF_QUEUE.send(message, { contentType: "json" });
} catch (error) {
  await revertQueuedClaim(c, caseId, runId);
  return c.json({ error: "enqueue_failed" }, 500);
}
return subscribeResponse(c.env, runId);
```

Parse-outside-try is the classic foot-gun: schema rejects → throw escapes → `producerGuard` already claimed QUEUED → row orphaned with no queue message + no revert. (The 500 body carries only `{ error: "enqueue_failed" }` — case/run ids stay in the server-side `console.error`, not the response.)

**Failure mode caught**: this exact bug shipped in the first iteration; fixed only after second-pass code audit. The schema field type loosening (e.g. `requestedBy: z.string().uuid()` → `z.string().min(1)` for nanoid user IDs) is **necessary but not sufficient** — the structural hole remains if parse is outside the try.

## 8. Worker `default export` for Hono + Queue: canonical pattern, not `satisfies ExportedHandler`

Hono's documented pattern is direct `fetch: app.fetch` assignment alongside sibling handlers:

```ts
export default {
  fetch: app.fetch,
  queue: dispatchQueue,
};
```

Annotating with `satisfies ExportedHandler<Env>` from `@cloudflare/workers-types` **breaks the compile** because the package's `Response` / `Request` types diverge structurally from the global DOM `Response` Hono returns (e.g. `Headers.getAll` missing on global). The Cloudflare runtime ABI enforces the structural contract; TypeScript can't, and the `Parameters<typeof app.fetch>` indirection pattern that some agents reach for is over-engineering compared to the direct assignment Hono docs prescribe.

**Failure mode caught**: a "type-safer" wrapper that fights both Hono and Cloudflare typings, requires `as` casts, and adds zero runtime safety.

---

## DLQ contract

- DLQ has its own consumer (`handleDlq`), bound via a second `queues.consumers` block in `wrangler.jsonc`.
- DLQ consumer flips terminal failures to `FAILED` via `UPDATE ... WHERE current_run_id = ? AND status IN ('QUEUED','RUNNING')`. The status guard prevents flipping a row whose run already advanced.
- DLQ consumer ALSO calls `finishBriefStream(env, runId)` after the flip — the terminal close for the run's `BriefStreamDO`, so a reviewer still subscribed gets a clean stream close instead of hanging (covers a run that threw before relaying any chunk; the consumer never finishes the DO on a retryable failure).
- `console.warn` for the success-flip path; `console.error` reserved for actual error branches (schema-invalid message, atomic UPDATE returning 0 rows).
- `msg.ack()` always — DLQ messages do not retry (`max_retries: 1` on the DLQ consumer).
- After DLQ flip → next POST is allowed by `producerGuard` because `FAILED` is in `ALLOWED_SOURCES`.

## 9. One `transitionCase` helper for every runId-pinned status mutation

Distinct call sites (consumer claim, consumer revert, producer revert, DLQ flip) all share the same shape: `UPDATE cases SET status = <to>, updated_at = NOW() WHERE id = ? AND current_run_id = ? AND status IN (<from>)`. Centralising in `@mizan/db` means:

- One place to read the canonical state-machine pattern
- `updated_at` is bumped on EVERY transition (powers the staleness check in pattern #3)
- `.returning()` row narrowing returns the post-transition row, so callers work against the fresh snapshot instead of a stale pre-claim row
- Race-loser semantics (`undefined` return) are uniform; no caller invents its own zero-row encoding

```ts
export async function transitionCase(
  db: Db,
  input: CaseTransitionInput,
): Promise<Case | undefined> {
  const sources = Array.isArray(input.from) ? [...input.from] : [input.from];
  const updated = await db
    .update(cases)
    .set({ status: input.to, updated_at: new Date() })
    .where(
      and(
        eq(cases.id, input.caseId),
        eq(cases.current_run_id, input.runId),
        inArray(cases.status, sources),
      ),
    )
    .returning();
  return updated[0];
}
```

Producer enqueue (`producerGuard`) is intentionally NOT routed through this helper — it MINTS a fresh runId rather than matching on an existing one, which is a structurally different operation.

**Failure mode caught**: scattered raw drizzle UPDATE patterns → one site forgets the `updated_at` bump → staleness check (#3) returns wrong answer → crash recovery misfires.

## 10. Drizzle / D1 engineering practices

Worker / D1 specifics, gathered through Phase 5:

- **One `makeDb(env.DB)` per request / per message batch.** D1 bindings are per-request handles; the Drizzle wrapper is cheap but creating a fresh one on every helper call inside the same request is wasteful. Hoist `const db = makeDb(env.DB)` at the entry (route handler, queue batch loop) and thread `db: Db` through helpers.
- **Per-request binding rule.** Workers reclaim the isolate at the end of the request; binding handles are valid only for that request. Never cache `makeDb` output globally — same rule as `createMastra(env)`.
- **D1 does NOT support multi-statement client transactions.** Every state machine guarantee must be expressed as a single atomic `UPDATE` with the right `WHERE` clauses (status + runId guards). Multi-row workflows that need true transactional semantics use `env.DB.batch([...])` instead of `db.transaction(...)` (the Drizzle helper isn't available on D1).
- **`.returning()` is the cheapest race detector.** Every transition function returns the post-mutation row (or `undefined` if zero rows matched). Callers narrow on the return value instead of issuing a second SELECT — saves a round-trip and removes a TOCTOU window.
- **drizzle-zod for JSON column branding.** Persisted JSON shapes (`briefs.payload_json`, `signals.payload_json`) are declared in `@mizan/shared` zod schemas and branded onto the column via `drizzle-zod`. The DB column type IS the shared zod schema — divergence becomes a compile error.
- **Migrations only via `drizzle-kit generate`.** Hand-written migrations are forbidden by project rule; one-shot backfills require explicit approval and inline JSDoc explaining why `drizzle-kit` couldn't emit it.
- **`Case` type re-exported from `@mizan/db`.** Domain types are inferred from drizzle's `$inferSelect` via drizzle-zod schemas — consumers import `type Case from "@mizan/db"` rather than reaching into private schema files.
- **No raw SQL outside test seeders.** Application code goes through Drizzle's typed builder. Test helpers (`seedCaseStatus`, `insertDraftCase`) live in `tests/integration/mode-b-helpers.ts` and use prepared statements with parameter binding — never string-interpolated SQL.
- **`updated_at` is bumped by transitions only, NOT by `upsertSignal` or brief writes.** Pattern #3's staleness check reads `cases.updated_at`. Every transition path (claim, revert, DLQ flip) bumps it through `transitionCase`. `upsertSignal` writes to the `signals` table; brief insert writes to the `briefs` table; neither updates `cases.updated_at`. The case row is therefore effectively "frozen at claim timestamp" for the duration of a workflow run — `RUNNING_STALE_THRESHOLD_MS = 10 min` is measuring "time since claim", not "time since the consumer last did work". The 10-min window is comfortably past the 5-min Worker wall-time cap, and the `retry-running` mapping (pattern #3) covers crash-but-fresh windows by routing through the queue's retry loop instead of waiting the full staleness window.
- **Strict-typed `from` parameter.** `CaseTransitionInput.from: CaseStatus | readonly CaseStatus[]` — the enum literal union means a typo in a transition source is a compile error. The `inArray(cases.status, sources)` predicate carries the enum constraint into the SQL guard.

## Status-machine invariants (cheat sheet)

```
                          briefProducerGuard (one guard, keyed on current status)
POST /:id/brief  ─────────┤
  → always 200 SSE        ├─ DRAFT | FAILED            → claim fresh runId, enqueue (status: QUEUED)
                          ├─ QUEUED | RUNNING          → rejoin: subscribe to the in-flight DO (no enqueue)
                          └─ ACTIONED | SUSPENDED_HITL → 409 invalid_source_status (terminal)

GET /:id/brief/stream     → 204 when current_run_id IS NULL; else 200 SSE (DO replay + live tail)

Consumer claim:           atomic UPDATE WHERE status IN ('QUEUED','RUNNING')
                                                  AND current_run_id = ?
                                          (RUNNING included only when msg.attempts > 1
                                           AND row.updated_at past stale threshold;
                                           attempts>1 + fresh row → msg.retry, not claim)

Consumer revert:          atomic UPDATE WHERE status = 'RUNNING'
  (on retryable failure)                          AND current_run_id = ?
                                                  SET status = 'QUEUED'

Producer revert:          atomic UPDATE WHERE status = 'QUEUED'
  (on enqueue throw)                              AND current_run_id = ?
                                                  SET status = 'DRAFT'

DLQ flip:                 atomic UPDATE WHERE status IN ('QUEUED','RUNNING')
  (+ finishBriefStream)                           AND current_run_id = ?
                                                  SET status = 'FAILED'
```

Every status transition is gated on both `id` AND `current_run_id` — the runId pin makes the state machine append-only per run. Concurrent claims on the same case are impossible (`producerGuard` rejoins an in-flight run rather than minting a second).

## Test posture

- **Unit tests** (`bun:test`) cover pure classification: `classifyRedelivery` with all status × attempts combinations, schema accept/reject, dispatch routing, producer-guard sources.
- **Integration tests** (`vitest` + `@cloudflare/vitest-pool-workers`) cover the full request/queue/D1/DO path. They now run in CI as a 2-shard matrix (hermetic — mock LLM, local Miniflare bindings, no secrets) after the lazy-Mastra refactor made the worker entry's static graph Mastra/AI-SDK-free. Full-workflow tests that hit `matchPolicy`'s live Vectorize are gated behind `RUN_REMOTE_INTEGRATION=1` and skipped in CI.
- **Contract tests** lock the HTTP surface: `brief-producer-rejoin.test.ts` (rejoin-vs-claim-vs-409), `brief-stream-route.test.ts` (GET resume 204/401/404/200), `brief-stream-do.test.ts` (DO buffer/replay/finish/disconnect).
- **Concurrency probe** asserts claim-race semantics (`Promise.all` two POSTs, same caseId, exactly one claims, both 200, row terminal) — wall-clock-free.

## Reference files

- `apps/worker/src/middleware/producer-guard.ts` — unified `briefProducerGuard` + `ALLOWED_SOURCES` + `invalid_source_status` vs rejoin/race distinction
- `apps/worker/src/middleware/producer-guard-helpers.ts` — `claimProducerCase` (QUEUED-only after unification)
- `apps/worker/src/routes/cases.ts` — `startBriefRun` + `resumeBriefStream` + `subscribeResponse` + `revertQueuedClaim`
- `apps/worker/src/queue/brief-consumer.ts` — Layer 3 idempotent consumer + `pipeRunToBriefStream` + status gate + `bestEffortFinish`
- `apps/worker/src/queue/brief-consumer-helpers.ts` — `classifyRedelivery` exhaustive switch + staleness gate
- `apps/worker/src/queue/dlq-consumer.ts` — terminal failure flip via `transitionCase` + `finishBriefStream`
- `apps/worker/src/durable/brief-stream-do.ts` + `brief-stream-client.ts` — the resumable-stream DO store + publish/finish helpers
- `packages/db/src/case-transitions.ts` — canonical `transitionCase` helper
- `packages/shared/src/schemas/queue-message.ts` — queue-message wire schema

## See also

- `docs/solutions/architecture-patterns/durable-resumable-brief-stream-do.md` — the store/executor split, unified guard, and the `run.stream()` stuck-RUNNING root cause this executor pairs with
- `docs/solutions/best-practices/ai-sdk-6-openai-strict-mode-integration.md` — Phase 4 schema lessons
- `docs/solutions/2026-05-21-vitest-to-bun-test.md` — why unit tests are on bun:test
- PRD §6 Phase 5, §7.5, §7.8, §7.10
