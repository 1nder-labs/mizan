---
title: Cloudflare Queues — Mode B background processing engineering patterns
date: 2026-05-24
category: best-practices
module: queue_system
problem_type: best_practice
component: queue_system
severity: high
applies_when:
  - "Building a Cloudflare Queues consumer on Workers"
  - "Running a Mastra workflow from both an HTTP route (SSE) and a queue consumer"
  - "Implementing Layer 3 idempotent redelivery on at-least-once delivery"
  - "Sharing a single producer endpoint between streaming and background modes via content negotiation"
  - "Reasoning about ack/retry/DLQ + status-machine guarantees"
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

# Cloudflare Queues — Mode B background processing engineering patterns

Ten load-bearing patterns from Mizan Phase 5 (`feat/phase-5-background-mode`). Each was settled after a brutal multi-agent review surfaced a real bug; the failure mode is documented under each pattern so future work can recognise the same shape early.

## 1. Content-negotiate on one endpoint, branch to two modes

One route. The `Accept` header picks the mode. SSE → Mode A (`run.stream`). JSON → Mode B (enqueue + 202). Both modes share the same Hono middleware chain (role gate, idempotency key, producer guard) — only the target status and the final handler differ.

```ts
.post(
  "/:id/brief",
  idempotencyKey,
  async (c, next) => (wantsEventStream(c) ? runningGuard(c, next) : queuedGuard(c, next)),
  routeBriefPost,
);
```

The two guards are **module-level constants** (`producerGuard("RUNNING")`, `producerGuard("QUEUED")`), not reconstructed per request — otherwise every POST allocates a fresh middleware closure.

**Failure mode caught**: reconstructing the guards inside the inline middleware on every request — invisible perf cost, easy to miss in code review.

## 2. Producer-guard factory with per-target source allow-lists

A single `producerGuard(target)` factory generates middleware for either target. But the **source statuses each target accepts must differ**:

| Target             | Sources accepted                                  | Why                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RUNNING` (Mode A) | `DRAFT`, `READY_FOR_REVIEW`, `ACTIONED`, `FAILED` | Reviewer can re-stream a completed brief; FAILED is retry-eligible                                                                                                                                         |
| `QUEUED` (Mode B)  | `DRAFT`, `FAILED`                                 | `revertQueuedClaim` always reverts to DRAFT on send failure; restricting sources to DRAFT/FAILED makes the revert **provably lossless** — a successful row cannot be downgraded by an enqueue compensation |

The factory also derives the in-flight response mode (`RUNNING → 409`, `QUEUED → 202 replay`) at factory creation time, not on every request.

**Failure mode caught**: using one shared `ALLOWED_STATUSES` set across both targets — Mode B enqueue failure on a `READY_FOR_REVIEW` row would silently downgrade it to DRAFT.

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
  case "READY_FOR_REVIEW":
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

The Mode A SSE handler and the Mode B queue consumer both need: per-request Mastra instance, workflow resolution, runId-pinned run creation, runtime context, env/ctx propagation. Six lines of identical bootstrap × two call sites = future drift.

```ts
export async function createBriefRun(env, input) {
  const ctx = buildBriefRunContext(env, input);
  const { mastra, langfuse } = createMastra(env);
  const workflow = mastra.getWorkflow("brief");
  const run = await workflow.createRun({ runId: input.runId });
  const requestContext = makeRuntimeContext(ctx);
  requestContext.set(MIZAN_ENV_KEY, env);
  return { langfuse, run, requestContext };
}
```

`MIZAN_CTX_KEY` is already set by `makeRuntimeContext`; don't re-set it here. Return only the fields the call sites use (`langfuse`, `run`, `requestContext`); `mastra` + `ctx` are internal and stay private.

Callers decide between `run.stream()` (Mode A) and `run.start()` (Mode B); everything before that diverge is single-sourced.

**Failure mode caught**: any change to Mastra's RequestContext shape, ENV key wiring, or runId pinning requires touching every call site — eventually one is missed.

## 6. Compensation must be guarded by the state it expects

The Mode B compensation `revertQueuedClaim` flips `QUEUED → DRAFT` when `BRIEF_QUEUE.send` throws. The `WHERE` clause **must** filter on `status = 'QUEUED'`:

```ts
.where(and(
  eq(cases.id, caseId),
  eq(cases.current_run_id, runId),
  eq(cases.status, "QUEUED"),
));
```

If a concurrent consumer atomically claimed the row to `RUNNING` (or DLQ flipped it to `FAILED`) in the millisecond window between `producerGuard` claiming `QUEUED` and `BRIEF_QUEUE.send` throwing, the revert must be a **no-op** — the row is no longer ours to revert.

Same principle for `setCaseStatus` (Mode A abort/error path): add `eq(cases.status, "RUNNING")` so a concurrent reviewer action that already finalised the case is preserved.

**Failure mode caught**: a compensation with no state guard regresses a completed brief to DRAFT under racy schedules.

## 7. Schema parse and side-effect must share one try block

The Mode B producer constructs the queue message body, parses it, sends to the queue, returns 202. **All three** must be inside the same try/catch that calls `revertQueuedClaim` on throw:

```ts
try {
  const message = BriefQueueMessageSchema.parse({ ... });
  await c.env.BRIEF_QUEUE.send(message, { contentType: "json" });
} catch (error) {
  await revertQueuedClaim(c.env, caseId, runId);
  return c.json({ error: "enqueue_failed" }, 500);
}
```

Parse-outside-try is the classic foot-gun: schema rejects → throw escapes → `producerGuard` already claimed QUEUED → row orphaned with no queue message + no revert.

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
- `console.warn` for the success-flip path; `console.error` reserved for actual error branches (schema-invalid message, atomic UPDATE returning 0 rows).
- `msg.ack()` always — DLQ messages do not retry (`max_retries: 1` on the DLQ consumer).
- After DLQ flip → next POST is allowed by `producerGuard` because `FAILED` is in `ALLOWED_QUEUED_SOURCES` (and `ALLOWED_RUNNING_SOURCES`).

## 9. One `transitionCase` helper for every runId-pinned status mutation

Five distinct call sites (consumer claim, consumer revert, producer revert, route-boundary set, DLQ flip) all share the same shape: `UPDATE cases SET status = <to>, updated_at = NOW() WHERE id = ? AND current_run_id = ? AND status IN (<from>)`. Centralising in `@mizan/db` means:

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
- **`updated_at` is bumped by transitions only, NOT by `upsertSignal` or brief writes.** Pattern #3's staleness check reads `cases.updated_at`. Every transition path (claim, revert, set, DLQ flip) bumps it through `transitionCase`. `upsertSignal` writes to the `signals` table; brief insert writes to the `briefs` table; neither updates `cases.updated_at`. The case row is therefore effectively "frozen at claim timestamp" for the duration of a workflow run — `RUNNING_STALE_THRESHOLD_MS = 10 min` is measuring "time since claim", not "time since the consumer last did work". The 10-min window is comfortably past the 5-min Worker wall-time cap, and the `retry-running` mapping (pattern #3) covers crash-but-fresh windows by routing through the queue's retry loop instead of waiting the full staleness window.
- **Strict-typed `from` parameter.** `CaseTransitionInput.from: CaseStatus | readonly CaseStatus[]` — the enum literal union means a typo in a transition source is a compile error. The `inArray(cases.status, sources)` predicate carries the enum constraint into the SQL guard.

## Status-machine invariants (cheat sheet)

```
                          producerGuard("RUNNING") → status: RUNNING
                          ┌──── allowed sources: DRAFT, READY_FOR_REVIEW, ACTIONED, FAILED
POST + Accept SSE  ───────┤
                          └──── in-flight (QUEUED|RUNNING): 409 without runId

                          producerGuard("QUEUED") → status: QUEUED
                          ┌──── allowed sources: DRAFT, FAILED
POST + Accept JSON ───────┤
                          └──── in-flight (QUEUED|RUNNING): 202 { run_id, replay: true }

Consumer claim:           atomic UPDATE WHERE status IN ('QUEUED','RUNNING')
                                                  AND current_run_id = ?
                                          (RUNNING included only when msg.attempts > 1
                                           AND row.updated_at past stale threshold;
                                           attempts>1 + fresh row → msg.retry, not claim)

Consumer revert:          atomic UPDATE WHERE status = 'RUNNING'
                                                  AND current_run_id = ?
                                                  SET status = 'QUEUED'

Producer revert:          atomic UPDATE WHERE status = 'QUEUED'
                                                  AND current_run_id = ?
                                                  SET status = 'DRAFT'

DLQ flip:                 atomic UPDATE WHERE status IN ('QUEUED','RUNNING')
                                                  AND current_run_id = ?
                                                  SET status = 'FAILED'

Mode A abort:             atomic UPDATE WHERE status = 'RUNNING'
                                                  AND current_run_id = ?
                                                  SET status = 'DRAFT'

Mode A pre-stream throw:  atomic UPDATE WHERE status = 'RUNNING'
                                                  AND current_run_id = ?
                                                  SET status = 'FAILED'
```

Every status transition is gated on both `id` AND `current_run_id` — the runId pin makes the state machine append-only per run. Concurrent runs on the same case are impossible (`producerGuard` rejects them at 409/replay-202).

## Test posture

- **Unit tests** (`bun:test`) cover pure classification: `classifyRedelivery` with all status × attempts combinations, schema accept/reject, dispatch routing, producer-guard targets.
- **Integration tests** (`vitest` + `@cloudflare/vitest-pool-workers`) cover the full request/queue/D1 path. Local-only — CI excludes them because each spec spawns a fresh workerd with a full Mastra/Langfuse/AI-SDK graph recompile (~13 min for 5 files). Re-enable when the pool supports cross-file workerd reuse.
- **Concurrency probe** asserts claim-race semantics (`Promise.all` two consumers, same caseId+runId, exactly one runs the workflow, both ack, row terminal) — wall-clock-free.

## Reference files

- `apps/worker/src/middleware/producer-guard.ts` — factory + per-target source allow-lists + `invalid_source_status` vs race distinction
- `apps/worker/src/routes/cases.ts` — content-negotiated branch + `enqueueBrief` + `revertQueuedClaim` + `setCaseStatus`
- `apps/worker/src/queue/brief-consumer.ts` — Layer 3 idempotent consumer
- `apps/worker/src/queue/brief-consumer-helpers.ts` — `classifyRedelivery` exhaustive switch + staleness gate
- `apps/worker/src/queue/dlq-consumer.ts` — terminal failure flip via `transitionCase`
- `apps/worker/src/queue/dispatch.ts` — multi-queue dispatcher + exported queue name constants
- `packages/mastra/src/runtime/brief-run-factory.ts` — shared workflow bootstrap
- `packages/mastra/src/mastra-factory.ts` — `createMastra(env)` per-request factory
- `packages/db/src/case-transitions.ts` — canonical `transitionCase` helper
- `packages/shared/src/schemas/queue-message.ts` — queue-message wire schema

## See also

- `docs/solutions/best-practices/ai-sdk-6-openai-strict-mode-integration.md` — Phase 4 schema lessons
- `docs/solutions/2026-05-21-vitest-to-bun-test.md` — why unit tests are on bun:test
- PRD §6 Phase 5, §7.5, §7.8, §7.10
