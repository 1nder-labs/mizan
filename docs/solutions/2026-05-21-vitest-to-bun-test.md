# vitest → bun test migration (Phase 3, 2026-05-21)

## What changed

- Worker unit tests + 1 web test moved from vitest to bun test
- 7 worker integration tests + 1 eval smoke test stay on vitest (`@cloudflare/vitest-pool-workers`)
- `apps/web/vitest.config.ts` deleted
- `apps/worker/vitest.config.ts` dropped the `unit` project, kept `integration`
- `expect-type` added as devDep in `apps/worker` (replaces vitest's `expectTypeOf` re-export)
- Pre-push lefthook gate blocks new `from "vitest"` imports in worker/unit + web/src

## Why

CI runtime cliff: the vitest unit project inherited the cloudflareTest pool's full Mastra graph compile when run together with integration tests. Splitting into bun test for unit work (<100ms cold start) + vitest integration-only (local-only) reduced CI to ~1m 30s in Phase 2; Phase 3 completes the swap.

## Matcher diff catalog

| vitest                         | bun:test                                  | Notes                                                   |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------- |
| `from "vitest"`                | `from "bun:test"`                         | Surface identical for describe/it/expect/beforeAll/etc. |
| `vi.fn()`                      | `mock()` from "bun:test"                  |                                                         |
| `vi.spyOn(obj, "m")`           | `spyOn(obj, "m")` from "bun:test"         | Unused in migrated files after Phase 3                  |
| `expectTypeOf` from vitest     | `expectTypeOf` from `expect-type` package | Same chain API; install standalone                      |
| `--outputFile=` (vitest junit) | `--reporter-outfile=` (bun test junit)    | CI flag rename                                          |
| `vitest run --project unit`    | `bun test ./tests/unit`                   | Bun walks the dir; no glob config                       |
| `toHaveBeenCalledOnce()`       | `toHaveBeenCalledTimes(1)`                | Bun matchers omit the vitest alias                      |

## Gate (post-migration, enforced)

```bash
grep -rE "from \"vitest\"|from 'vitest'|@vitest/" apps/web/src apps/worker/tests/unit
```

Returns zero matches. lefthook pre-push enforces this against the to-be-pushed diff.

## What stays on vitest (intentional)

- `apps/worker/tests/integration/**` — vendor-locked to `@cloudflare/vitest-pool-workers`
- `packages/eval/src/smoke-001.eval.ts` — same harness

## Per-file changes

| File                                                 | Action                                      |
| ---------------------------------------------------- | ------------------------------------------- |
| apps/worker/tests/unit/clamp.test.ts                 | import swap                                 |
| apps/worker/tests/unit/get-model.test.ts             | import swap                                 |
| apps/worker/tests/unit/idempotency-key.test.ts       | import swap + vi.fn → mock                  |
| apps/worker/tests/unit/make-extractor.test.ts        | import swap                                 |
| apps/worker/tests/unit/make-telemetry.test.ts        | import swap                                 |
| apps/worker/tests/unit/require-role.test.ts          | import swap + vi.fn → mock                  |
| apps/worker/tests/unit/schema-shape.test.ts          | import swap + expectTypeOf from expect-type |
| apps/worker/tests/unit/zod-refinements.test.ts       | import swap                                 |
| apps/worker/tests/unit/match-policy-helpers.test.ts  | new bun-native helper coverage              |
| apps/worker/tests/unit/compose-brief-helpers.test.ts | new bun-native helper coverage              |
| apps/web/src/lib/utils.test.ts                       | import swap                                 |

## References

- [Bun test docs](https://bun.sh/docs/cli/test)
- [expect-type on npm](https://www.npmjs.com/package/expect-type)
- PRD Phase 3 In-Scope (test runtime migration bullet)
