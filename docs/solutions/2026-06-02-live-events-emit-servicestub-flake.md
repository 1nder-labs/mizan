# Pre-existing full-suite flake: live-events-emit ServiceStub DataCloneError (2026-06-02)

## Symptom

Running the **entire** worker integration suite (`bun --filter @mizan/worker test:integration`,
36 files) intermittently fails **one** file with hundreds of repeated errors. The victim file is
**non-deterministic** — it is whichever heavy span-exercising file happens to run after ~30 files
under heap pressure. Observed victims: `tests/integration/live-events-emit.test.ts` (first sighting)
and `tests/integration/mode-b-dlq-failed.test.ts` (client-portal pre-PR run). The error:

```
DataCloneError: ServiceStub serialization requires the 'experimental' compat flag.
  @mastra/observability/src/spans/serialization.ts deepClean → BaseSpan → DefaultSpan
  → createSpan → getOrCreateSpan → Run._start (workflows/workflow.ts)
```

## Diagnosis

- **Passes in isolation** (`test:integration live-events-emit` → 2/2 green).
- Only surfaces in the full 36-file serial run, after ~30 files.
- Root cause is in `@mastra/observability` span serialization: a Cloudflare **binding stub**
  (`ServiceStub`) leaks into a workflow span's payload and `structuredClone` rejects it without
  the workerd `experimental` compat flag. This is a Phase 8 (observability) concern, **not** an
  auth/schema/workflow-logic defect.
- Heavier files that exercise the _same_ span pipeline (`brief-workflow`, `phase-4-workflow`)
  pass in the same run — so it is an ordering/heap-pressure artifact, not a deterministic break.

## Status

Tracked, not fixed — out of scope for the client-portal work (U2 discovered it, did not cause it;
U2 touches zero observability code). A real fix belongs in the Phase 8 observability span
hygiene (scrub binding refs from span input before serialize, or set the workerd `experimental`
compat flag for the integration pool).

## Workaround for runners

The suite is **local-only** (not in CI). For per-unit work, run the unit's own tests + its
auth/signup/schema neighbours; reserve the full 36-file run as a single pre-PR gate and re-run
`live-events-emit` in isolation to confirm green if the full run trips it.
