---
title: Durable, resumable brief streaming via a Durable Object store + queue executor
date: 2026-06-15
category: architecture-patterns
module: brief_system
problem_type: architecture_pattern
component: brief_streaming
severity: high
applies_when:
  - "Streaming a long-running Workers job (LLM/Mastra workflow) to a browser that may disconnect"
  - "The job MUST complete + persist regardless of the client connection, while still feeling real-time"
  - "Wiring AI SDK useChat resumable streams on Cloudflare Workers (no Redis)"
  - "Deciding where workflow execution lives vs where the stream is buffered"
  - "Unifying a content-negotiated two-mode (stream vs background) producer into one path"
tags:
  - cloudflare-workers
  - durable-objects
  - cloudflare-queues
  - mastra
  - ai-sdk
  - resumable-streams
  - brief-system
---

# Durable, resumable brief streaming via a Durable Object store + queue executor

## Context

The brief workflow streamed live to the reviewer over SSE, but execution was
**coupled to the SSE connection** (the old "Mode A": `run.stream()` ran inside
the HTTP handler). When a reviewer closed the tab mid-run, the Workers execution
context tore down and the case was stranded in `RUNNING` forever — the original
"stuck at generating brief" symptom. A parallel "Mode B" queue path existed for
disconnected clients, selected by `Accept`-header content negotiation, which
doubled the surface area (two guards, two finishers, two failure stories).

Goal: the brief **always runs to completion and persists**, regardless of the
client connection, while preserving the live step-by-step streaming feel — on
one code path.

## Guidance

### 1. Split the two responsibilities: a STORE and an EXECUTOR

- **Executor = the Cloudflare Queue consumer.** It owns running the Mastra
  workflow and persisting the brief. A client disconnect cannot touch it. This
  is the durable backbone (crash-recovery claim/revert/DLQ state machine).
- **Store = one Durable Object per `runId` (`BriefStreamDO`).** It is a _dumb
  broker_, the Workers-native substitute for the AI SDK resumable-stream Redis
  store. It buffers every SSE chunk in DO SQLite, broadcasts live to connected
  subscribers, and replays the buffer + tails live on (re)connect. It NEVER runs
  the workflow — running the Mastra engine + D1Store inside a DO is the
  divergence to avoid.

The consumer streams `run.stream()` and relays each chunk into the DO; the
HTTP route just subscribes to the DO. Execution and the live view are fully
decoupled.

### 2. The client uses `useChat({ resume: true })`, not a bespoke reconnect

`POST /:id/brief` always returns `200 text/event-stream` (subscribe to the DO).
On mount the AI SDK fires a reconnect GET via
`prepareReconnectToStreamRequest` → `GET /:id/brief/stream`; a `204` (no active
run) is a silent SDK no-op. A full buffer replay is idempotent because the SDK
reconciles UIMessage parts by id — so reload/resume is seamless.

### 3. Unify the producer guard (the single biggest simplification)

One guard, no content negotiation, keyed only on current status:

| Current status                           | Action                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| `DRAFT` / `FAILED`                       | **Claim** a fresh `runId`, enqueue (replay=false)              |
| `QUEUED` / `RUNNING`                     | **Rejoin** — subscribe to the in-flight DO, no enqueue, no 409 |
| `ACTIONED` / `SUSPENDED_HITL` (terminal) | **409** — the decision is made; cannot re-brief                |
| cross-org                                | **404**                                                        |

"Rejoin" is what makes a second POST (or a reconnect) safe on an in-flight case.
Terminal-409 is what makes the UI honest: an ACTIONED case must NOT show a
"Generate" button (it would 409-loop) — terminal means terminal.

## Why This Matters

### The load-bearing root cause: `run.stream()` resolves failed, it does NOT throw

Mastra's `run.stream()` returns a stream object whose `stream.result` resolves
to `{ status: 'success' | 'failed' | 'suspended' | 'canceled' | 'tripwire' }`.
A failed step does **not** reject — it resolves with `status: 'failed'`. If the
consumer only awaits the stream and never inspects the result, a failed run is
silently `ack`ed and the case is left in `RUNNING` — which the unified guard
rejects as a re-brief source (only `DRAFT`/`FAILED` claim), **bricking the
case**. This is the real mechanism behind "stuck at generating brief."

The fix is a status gate: after the stream drains, await `stream.result` and
throw on any non-OK status so the consumer reverts → retries → DLQ → `FAILED`
→ the UI shows a retry CTA. Only `success` and `suspended` (HITL, brief
persisted) are clean terminals.

### Finish is terminal-only, and best-effort

The DO is `finish()`ed ONLY on a terminal outcome — success/suspend (in the
consumer) or DLQ exhaustion (in the DLQ consumer). A retryable failure leaves
the DO open so the retried run (which Mastra resumes from its last persisted
step) appends to the **same** buffer. The success-path finish must be
best-effort (swallow + log): the run already reached its terminal state and the
brief is persisted, so a failed DO close must not rethrow and trigger a spurious
queue retry of an already-succeeded run.

## When to Apply

- Any long Workers job streamed to a browser where the job must outlive the
  connection (LLM generation, multi-step workflows, report builders).
- Reach for a DO-as-store when you want AI SDK resumable streams but have no
  Redis — the DO's per-key SQLite buffer + single-threaded broadcast is the
  Workers-native equivalent.
- Keep the executor in a Queue consumer (durable, retdriable, DLQ-backed), not
  in the request handler or the DO.

## Examples

### Status gate in the consumer (the anti-strand guard)

```ts
const TERMINAL_OK_STATUSES: ReadonlySet<string> = new Set(["success", "suspended"]);

await relayToBriefStream(env, runId, response.body); // drains run.stream() → DO
const result = await workflowStream.result; // resolves, never throws
if (!TERMINAL_OK_STATUSES.has(result.status)) {
  throw new Error(`brief workflow settled non-OK (status=${result.status} run=${runId})`);
  // → executeClaimedRun catch → revertClaim(RUNNING→QUEUED) → msg.retry() → DLQ → FAILED
}
await bestEffortFinish(env, runId); // success/suspend: close DO; swallow+log on throw
```

### DO boundary crosses only universal types (no RPC generic, no cast)

`@cloudflare/workers-types` `Response`/`ReadableStream` are nominally
incompatible with the DOM lib. Cross the DO boundary with only **string** bodies
(publish one chunk) and **`Uint8Array`** (subscribe re-pump) — both universal —
to sidestep the split. A `DurableObjectNamespace<BriefStreamDO>` RPC generic
triggered TS2589 "excessively deep"; a plain `DurableObjectNamespace` +
`fetch()` with string/byte bodies is the working shape.

### Relay must flush the decoder tail (Unicode safety)

`TextDecoder` with `{ stream: true }` buffers an incomplete multibyte sequence;
without a final flush after the read loop, a trailing UTF-8 codepoint is dropped
— real for Arabic campaign text that spans a chunk boundary:

```ts
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  if (value) await publishBriefChunk(env, runId, decoder.decode(value, { stream: true }));
}
const tail = decoder.decode();
if (tail) await publishBriefChunk(env, runId, tail);
```

### Verified end-to-end (local wrangler dev, real OpenAI + Vectorize)

Client disconnect at 3s → run completed server-side → `SUSPENDED_HITL` + brief
persisted. Finished-run resume replayed the full 56-event buffer + clean
`finish`/`[DONE]`. Mid-run reconnect replayed + live-tailed to completion.
(`wrangler dev` WITHOUT `--local` so the `remote:true` Vectorize binding
proxies live.)

## See also

- `docs/solutions/best-practices/cloudflare-queues-mode-b-background-engineering.md`
  — the queue consumer (executor) crash-recovery/claim/revert/DLQ patterns this
  design builds on (refreshed to the unified path).
- `docs/solutions/architecture-patterns/tanstack-query-inactive-cache-refetch.md`
  — `invalidateQueries({ refetchType: 'all' })` on stream finish/error.
- `docs/solutions/best-practices/ai-sdk-6-openai-strict-mode-integration.md`
  — AI SDK 6 structured-output schema constraints (composeBrief).

## Reference files

- `apps/worker/src/durable/brief-stream-do.ts` — the DO store (buffer/broadcast/replay/finish).
- `apps/worker/src/durable/brief-stream-client.ts` — worker-side publish/finish helpers (throw on non-2xx).
- `apps/worker/src/queue/brief-consumer.ts` — the executor: `pipeRunToBriefStream` + status gate + `bestEffortFinish`.
- `apps/worker/src/queue/dlq-consumer.ts` — terminal `FAILED` flip + DO finish.
- `apps/worker/src/middleware/producer-guard.ts` — unified `briefProducerGuard`.
- `apps/worker/src/routes/cases.ts` — `startBriefRun` / `resumeBriefStream` / `subscribeResponse`.
- `apps/web/src/components/brief/stream.tsx` + `transport.ts` — `useChat({ resume: true })` + reconnect override.
- `apps/web/src/components/case/brief-phase.ts` — `deriveMode` (autoStart + RUNNING-errored reconnect).
