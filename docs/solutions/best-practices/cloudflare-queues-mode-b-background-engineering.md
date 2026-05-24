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

Eight load-bearing patterns from Mizan Phase 5 (`feat/phase-5-background-mode`). Each was settled after a brutal multi-agent review surfaced a real bug; the failure mode is documented under each pattern so future work can recognise the same shape early.

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

## 3. `msg.attempts` is the only honest signal for crash recovery vs concurrent duplicate

Cloudflare Queues delivers messages at-least-once. A redelivery against a row already in `RUNNING` has two indistinguishable causes by row state alone:

1. **Concurrent duplicate** — another consumer is actively running the workflow right now. Ack and let it finish.
2. **Crash recovery** — the prior consumer claimed `QUEUED → RUNNING`, then crashed before reverting. The row is stuck; the redelivery must reclaim.

`msg.attempts === 1` ⇒ first delivery ⇒ concurrent duplicate ⇒ `ack-running`.
`msg.attempts > 1` ⇒ redelivery ⇒ crash recovery ⇒ `claim`.

```ts
case "RUNNING":
  return attempts > 1 ? "claim" : "ack-running";
```

The atomic claim itself (`UPDATE ... WHERE status IN ('QUEUED','FAILED','RUNNING') AND current_run_id = ?`) is the mutex; Mastra's runId-keyed D1 persistence is the backstop against double execution against the same run.

**Failure mode caught**: blanket `ack-running` for ALL RUNNING redeliveries → crash recovery is dead code → stuck cases never reach DLQ → reviewer 202-replay loop forever.

## 4. Exhaustive switch + `assertNever` on the status enum

Status classification fans out by `row.status`. An exhaustive switch over the literal enum union with an `assertNever` default surfaces enum additions as **compile errors** rather than silent acks.

```ts
switch (row.status) {
  case "READY_FOR_REVIEW":
  case "ACTIONED":
  case "SUSPENDED_HITL":
    return "ack-terminal";
  case "RUNNING":
    return attempts > 1 ? "claim" : "ack-running";
  case "QUEUED":
  case "FAILED":
    return "claim";
  case "DRAFT":
    console.error("brief queue orphaned DRAFT row", { caseId: row.id, runId });
    return "ack-mismatch";
  default:
    return assertNever(row.status, { caseId: row.id, runId });
}
```

`SUSPENDED_HITL` is handled explicitly — Phase 7 introduces it; the queue path doesn't own resume, but **must** not poison the workflow if a redelivery races a HITL suspend.

**Failure mode caught**: a default-fallthrough that silently acks unknown statuses → a new enum value added in Phase 7/8 silently breaks queue idempotency without any compile-time signal.

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
  requestContext.set(MIZAN_CTX_KEY, ctx);
  return { mastra, langfuse, run, requestContext, ctx };
}
```

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

Consumer claim:           atomic UPDATE WHERE status IN ('QUEUED','FAILED','RUNNING')
                                                  AND current_run_id = ?
                                          (RUNNING included only when msg.attempts > 1)

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

- `apps/worker/src/middleware/producer-guard.ts` — factory + per-target source allow-lists
- `apps/worker/src/routes/cases.ts` — content-negotiated branch + `enqueueBrief` + `revertQueuedClaim` + `setCaseStatus`
- `apps/worker/src/queue/brief-consumer.ts` — Layer 3 idempotent consumer
- `apps/worker/src/queue/brief-consumer-helpers.ts` — `classifyRedelivery` exhaustive switch
- `apps/worker/src/queue/dlq-consumer.ts` — terminal failure flip
- `apps/worker/src/queue/dispatch.ts` — multi-queue dispatcher
- `packages/mastra/src/runtime/brief-run-factory.ts` — shared workflow bootstrap
- `packages/shared/src/schemas/queue-message.ts` — queue-message wire schema

## See also

- `docs/solutions/best-practices/ai-sdk-6-openai-strict-mode-integration.md` — Phase 4 schema lessons
- `docs/solutions/2026-05-21-vitest-to-bun-test.md` — why unit tests are on bun:test
- PRD §6 Phase 5, §7.5, §7.8, §7.10
