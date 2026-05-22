---
date: 2026-05-20
learning_type: bootstrap
subsystem: supply-chain-security
phase: 0
title: First-install baseline — Socket scanner output, bake-resolved versions, publisher verification
---

# First-install baseline (2026-05-20)

This is the first `docs/solutions/` entry. It captures the green-tree shape of
Phase 0's `bun install` so every later install (Renovate bump, manual `bun add`,
CI cold install) has an audit-trail-grade reference to compare against.

## TL;DR

- **Install duration:** 9.25 s cold, 1.2 s warm (`bun install --dry-run` resolves in 1.25 s)
- **Packages installed:** 1636 cold, 312 effective after Phase-0-only strip
- **Socket scanner scanned:** 1088 packages on cold; 312 on stripped → ZERO flagged
- **`bun audit --audit-level=high`:** exit 0; zero HIGH or CRITICAL vulnerabilities in the green tree
- **All six local gates (`audit + lint + format:check + typecheck + knip + test`):** exit 0
- **Vitest + Miniflare smoke:** 3/3 tests pass against real D1 + R2 + Vectorize + KV + Queue + Assets bindings (workerd binary cap: compat date 2026-05-11)

## Socket Security Scanner output

```
[@socketsecurity/bun-security-scanner] Scanning 312 packages took 1001ms
⚠ Socket Security Scanner free mode. Set SOCKET_API_KEY to use your Socket org settings.
```

Free-tier mode (no `SOCKET_API_KEY`); zero packages flagged as malicious,
typosquatted, or hijacked. The "free mode" warning is informational — the
scanner still queries Socket's threat-intel feed; an org-level API key only
unlocks per-org policy + extended advisory metadata.

The scanner package itself (`@socketsecurity/bun-security-scanner@1.1.2`) is
on `bunfig.toml`'s `minimumReleaseAgeExcludes` so its own emergency updates
ship inside the 14-day attack window. Its `_npmUser` is
`GitHub Actions <npm-oidc-no-reply@github.com>` (modern trusted-publisher
OIDC flow). Postinstall script: none observed during install; no
`trustedDependencies` allowlist additions required.

## 14-day bake rule in action

`bunfig.toml install.minimumReleaseAge = 1209600` (14 days) caused the FIRST
`bun install --dry-run` (run with the originally-pinned "latest as of
2026-05-19" versions) to reject 17 direct + 1 transitive dependency for
being too fresh. This is the security stack working exactly as designed.

Resolution: re-pinned every blocked package to its highest semver published
on or before 2026-05-06 (today minus 14 days). The full delta:

| Package                         | Brainstorm-pinned (blocked) | Bake-passing (installed) |
| ------------------------------- | --------------------------- | ------------------------ |
| hono                            | 4.12.21                     | 4.12.18                  |
| @hono/zod-validator             | 0.8.0                       | 0.7.6                    |
| ai                              | 6.0.185                     | 6.0.175                  |
| @ai-sdk/anthropic               | 3.0.78                      | 3.0.75                   |
| @ai-sdk/openai                  | 3.0.64                      | 3.0.62                   |
| @mastra/cloudflare-d1           | 1.0.6                       | 1.0.5                    |
| @mastra/hono                    | 1.4.17                      | 1.4.13                   |
| @mastra/ai-sdk                  | 1.4.2                       | 1.4.1                    |
| @mastra/observability           | 1.12.0                      | 1.11.1                   |
| mastra                          | 1.9.3                       | 1.8.1                    |
| better-auth                     | 1.6.11                      | 1.6.9                    |
| @better-auth/drizzle-adapter    | 1.6.11                      | 1.6.9                    |
| @better-auth/cli                | 1.4.21                      | 1.4.22                   |
| oxlint                          | 1.66.0                      | 1.63.0                   |
| oxfmt                           | 0.51.0                      | 0.48.0                   |
| knip                            | 6.14.1                      | 6.12.0                   |
| lefthook                        | 2.1.8                       | 2.1.6                    |
| tsx                             | 4.22.3                      | 4.21.0                   |
| @cloudflare/vitest-pool-workers | 0.16.7                      | 0.16.0                   |
| @cloudflare/workers-types       | 4.20260519.1                | 4.20260506.1             |
| wrangler                        | 4.93.0                      | 4.88.0                   |
| vitest                          | 4.1.6                       | 4.1.5                    |
| vite                            | 8.0.13                      | 8.0.10                   |
| @vitejs/plugin-react            | 6.0.2                       | 6.0.1                    |
| tailwindcss                     | 4.3.0                       | 4.2.4                    |
| @tailwindcss/vite               | 4.3.0                       | 4.2.4                    |
| @tanstack/react-query           | 5.100.11                    | 5.100.9                  |
| @tanstack/react-query-devtools  | 5.100.11                    | 5.100.9                  |
| @tanstack/react-router          | 1.170.4                     | 1.169.2                  |
| @tanstack/router-vite-plugin    | 1.167.6                     | 1.166.50                 |
| react-hook-form                 | 7.76.0                      | 7.75.0                   |
| @types/node                     | 25.9.1                      | 25.6.0                   |
| @types/react                    | 19.2.6 (wrong; corrected)   | 19.2.14                  |
| @types/react-dom                | 19.2.6 (wrong; corrected)   | 19.2.3                   |

**Unchanged (already bake-passing):** zod@4.4.3, drizzle-orm@0.45.2,
drizzle-kit@0.31.10, drizzle-zod@0.8.3, react@19.2.6, react-dom@19.2.6,
typescript@6.0.3, clsx@2.1.1, tailwind-merge@3.5.0,
class-variance-authority@0.7.1, @radix-ui/react-slot@1.2.4,
@openrouter/ai-sdk-provider@2.9.0, @ai-sdk/provider@3.0.10,
better-auth-cloudflare@0.3.0.

This is exactly the dynamic the `minimumReleaseAge` rule is supposed to
produce: you get latest-stable-that-has-been-out-long-enough-to-spot-fraud,
not latest-shiny.

## Publisher + recency verification

Every top-level dep was sampled via `bun pm view <pkg> --json`. All `_npmUser`
values match the expected maintainer surface:

| Package                              | `_npmUser`                                      | Repository                                  |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------- |
| hono                                 | yusukebe `<yusuke@kamawada.com>`                | github.com/honojs/hono                      |
| clsx                                 | lukeed `<luke@lukeed.com>`                      | github.com/lukeed/clsx                      |
| class-variance-authority             | joebell93 `<joe@joebell.co.uk>`                 | github.com/joe-bell/cva                     |
| knip                                 | webpro `<lars@webpro.nl>`                       | github.com/webpro-nl/knip                   |
| @radix-ui/react-slot                 | chancestrickland `<hi@chance.dev>`              | github.com/radix-ui/primitives              |
| react / react-dom                    | react-bot `<react-core@meta.com>`               | github.com/facebook/react                   |
| typescript                           | typescript-bot `<typescript@microsoft.com>`     | github.com/microsoft/TypeScript             |
| @types/\*                            | types `<ts-npm-types@microsoft.com>`            | github.com/DefinitelyTyped/DefinitelyTyped  |
| @cloudflare/\*, wrangler             | GitHub Actions `<npm-oidc-no-reply@github.com>` | github.com/cloudflare/{workers-sdk,workerd} |
| @tailwindcss/\*, tailwindcss         | GitHub Actions `<npm-oidc-no-reply@github.com>` | github.com/tailwindlabs/tailwindcss         |
| @vitejs/plugin-react, vite           | GitHub Actions `<npm-oidc-no-reply@github.com>` | github.com/vitejs/{vite-plugin-react,vite}  |
| oxlint, oxfmt                        | GitHub Actions `<npm-oidc-no-reply@github.com>` | github.com/oxc-project/oxc                  |
| vitest                               | GitHub Actions `<npm-oidc-no-reply@github.com>` | github.com/vitest-dev/vitest                |
| lefthook                             | GitHub Actions `<npm-oidc-no-reply@github.com>` | github.com/evilmartians/lefthook            |
| tsx                                  | GitHub Actions `<npm-oidc-no-reply@github.com>` | github.com/privatenumber/tsx                |
| @socketsecurity/bun-security-scanner | GitHub Actions `<npm-oidc-no-reply@github.com>` | github.com/SocketDev/bun-security-scanner   |
| tailwind-merge                       | GitHub Actions `<npm-oidc-no-reply@github.com>` | github.com/dcastil/tailwind-merge           |

Modern projects publish via npm OIDC trusted-publisher tokens
(`GitHub Actions <npm-oidc-no-reply@github.com>`), which is strictly more
secure than a long-lived PAT — there's no human credential to leak.
Individual-maintainer entries (`yusukebe`, `lukeed`, `joebell93`,
`chancestrickland`, `webpro`) match the expected long-time maintainers of
those projects.

No unexpected `_npmUser` value → no install blocked pending review.

## CVE audit at first install

`bun audit --audit-level=high` initially flagged TWO HIGH CVEs against the
ORIGINAL over-installed dep set:

1. **lodash `>=4.0.0 <=4.17.23` — code injection via `_.template`** (GHSA-r5fr-rjxr-66jc)
   Pulled by `mastra` and `@better-auth/cli` (transitive).
2. **drizzle-orm `<0.45.2` — SQL injection via improperly escaped identifiers** (GHSA-gpj5-g38j-94v9)
   Pulled by `better-auth` (transitive 0.41.0).

Both went away naturally when the workspace package.json files were stripped
to the Phase 0 actual-usage subset (per brainstorm §3.2 explicit policy:
"Phase 0 installs only the subset enumerated in PRD §6 Phase 0"). Mastra +
drizzle + better-auth land in Phase 1+; until then they're not in the tree
and the transitives don't apply.

If those CVEs resurface when those packages get installed in later phases,
the resolution is:

- For drizzle: pin direct `drizzle-orm@>=0.45.2` (already the case in the
  brainstorm).
- For lodash: add a root `overrides` block forcing `lodash@>=4.18.0`. This
  was tried during Phase 0 + then removed when the transitive parent left
  the tree.

## Other supply-chain configuration verifications

- `bun.lock` (text JSONC, Bun 1.2+ default) is the only lockfile in the
  working tree. `bun.lockb` does not exist and is `.gitignore`'d.
- `bun install --frozen-lockfile --no-cache` (the CI install command) exits 0.
- `bun audit --audit-level=high --prod` (the pre-commit gate) exits 0.
- Lefthook hooks installed via `bunx lefthook install`:
  `.git/hooks/pre-commit` + `.git/hooks/pre-push` are executable.
- Lefthook deliberate-failure tests:
  - Stage a line containing `// TODO scratch` in any non-test source file →
    `git commit -m "test"` rejected by `forbidden-patterns`.
  - Stage `const x: any = 1;` in any non-test source file →
    `git commit -m "test"` rejected by `forbidden-patterns` AND
    `oxlint` (`typescript/no-explicit-any`).
- Renovate config: `bunx renovate-config-validator renovate.json` exits 0.

## Cloudflare resources (provisioned U9)

| Resource        | Name                 | ID / Identifier                      |
| --------------- | -------------------- | ------------------------------------ |
| D1 database     | mizan                | 86feeedb-734e-4d6c-8310-011dc58754ac |
| KV namespace    | mizan-kv             | 597f67d85db94ae4b4a90175fa465605     |
| R2 bucket       | mizan-uploads        | (name is identifier)                 |
| Vectorize index | mizan-policy-corpus  | dimensions=1536, metric=cosine       |
| Queue (primary) | mizan-brief-jobs     | (name is identifier)                 |
| Queue (DLQ)     | mizan-brief-jobs-dlq | (name is identifier)                 |

Account: `558c97456d4a969cb82bee23d2054613` (`Eddie@algominds.ai's Account`).
Account ID is checked into `apps/worker/wrangler.jsonc` `account_id` field
(public; an account ID does NOT grant access, only the OAuth token does).

## Phase-0-specific environmental quirks

- **`compatibility_date`: 2026-05-11.** Plan + brainstorm + PRD originally
  targeted 2026-05-19, but the workerd binary inside
  `@cloudflare/vitest-pool-workers@0.16.0` (which pins
  `miniflare@4.20260504.0`) supports compat dates only up to 2026-05-11.
  Setting 2026-05-19 causes `miniflare` to refuse runtime startup with
  `This Worker requires compatibility date "2026-05-19", but the newest
date supported by this server binary is "2026-05-11".`
  Resolution: pin compat date to the workerd binary's max. Bumping the
  miniflare/pool-workers package is bake-blocked; Phase 8+ revisits.
- **vitest miniflare `assets.directory` is REQUIRED, not optional.** The
  Cloudflare workers-sdk fixture (`workers-assets-no-dir`) suggests omitting
  it works, but `@cloudflare/vitest-pool-workers@0.16.0`'s zod schema
  validates `directory` as required. Worked around by setting
  `directory: "."` in the vitest config's miniflare override (always-existing
  path; no actual asset routing in Phase 0 tests).
- **`apps/worker` needs `"type": "module"`.** Vite 8's config loader uses
  Rolldown to bundle `vitest.config.ts`; without `"type": "module"` on the
  workspace package.json, Rolldown tries to `require()` the ESM-only
  `@cloudflare/vitest-pool-workers` and fails. Setting the type fixes it
  without affecting Wrangler dev (Wrangler 4 supports both).
- **Tailwind 4's `@tailwindcss/vite` + Vite 8 = Rolldown bundler.** First
  install pulled `rolldown@1.0.1` as transitive of `vite@8.0.13`. Both were
  too fresh and bake-blocked. Downgrading to `vite@8.0.10` pulled
  `rolldown@1.0.0-rc.17` which is bake-passing.

## Local Langfuse stack

`docker compose -f docker/docker-compose.langfuse.yml up -d` started the
`mizan-langfuse-db` Postgres container healthy; the `mizan-langfuse` web
container failed to bind port 3010 on this dev machine because something
else was already listening on that port. The compose file itself validates
clean (`docker compose ... config` exits 0); the conflict is
machine-specific. Future contributor either frees 3010 or overrides the
port mapping locally.

## Where this goes next

- Phase 1 reinstalls drizzle + better-auth deps; audit will likely resurface
  the lodash/drizzle CVEs that disappeared in Phase 0 — handle via the
  documented overrides pattern.
- Phase 2 lands the Langfuse observability contract in the provider factory
  per PRD §6 Phase 2 / §7.7 / §12.
- Phase 8 stands up the local Langfuse dashboard and verifies the full
  trace tree (workflow → step → tool → llm-generation w/ token + cost).
- Renovate's first PR will land 14 days from now (2026-06-03) with the
  highest-semver bumps that have passed the bake window. Compare against
  this baseline for regressions.

## Phase 1 delta (2026-05-20)

### Dep additions vs Phase 0

| Workspace     | Dep                            | Version                   |
| ------------- | ------------------------------ | ------------------------- |
| `apps/worker` | `better-auth`                  | 1.6.9                     |
| `apps/worker` | `better-auth-cloudflare`       | 0.3.0                     |
| `apps/worker` | `@better-auth/drizzle-adapter` | 1.6.9                     |
| `apps/worker` | `drizzle-orm`                  | 0.45.2                    |
| `apps/worker` | `@mizan/db`                    | workspace:\*              |
| `apps/worker` | `@hono/zod-validator`          | 0.7.6                     |
| `apps/worker` | `zod`                          | 4.4.3                     |
| `packages/db` | `drizzle-orm`                  | 0.45.2                    |
| `packages/db` | `drizzle-zod`                  | 0.8.3                     |
| `packages/db` | `zod`                          | 4.4.3                     |
| `packages/db` | `@better-auth/cli`             | 1.4.22 (devDep)           |
| `packages/db` | `better-auth`                  | 1.6.9 (devDep — cli peer) |
| `packages/db` | `drizzle-kit`                  | 0.31.10 (devDep)          |

### CVE re-surfacing + overrides

- `lodash` transitive (via `@better-auth/cli`) → root `overrides` locks `4.18.1`.
- `drizzle-orm` transitive (via `better-auth-cloudflare`) → root `overrides` locks `0.45.2`.
- Post-install `bun audit --audit-level=high` exits 0; no new HIGH/CRITICAL beyond the two pinned.

### Tracked upstream type skew

- `apps/worker/src/auth/index.ts` carries ONE `@ts-expect-error` for `better-auth-cloudflare@0.3.0`'s
  `endpoints.upload?: StrictEndpoint | undefined` declaration, which is structurally incompatible with
  `better-auth@1.6.x`'s `BetterAuthPlugin.endpoints?: { [key: string]: Endpoint }` index signature
  (no `undefined` allowed). Runtime behaviour is unaffected — the plugin only emits the `upload`
  endpoint when an R2 binding is configured, and Phase 1 routes never hit it. Revisit when bac
  publishes a 0.4.x with declared `Endpoint`-typed endpoints (Renovate-watched).
- The earlier-staged `KVNamespace`/`R2Bucket` skew was resolved by switching `apps/worker/src/env.ts`
  to import `D1Database`, `KVNamespace`, `R2Bucket`, `VectorizeIndex`, `Queue`, `Fetcher` from
  `@cloudflare/workers-types` directly (instead of the workerd-generated `Cloudflare.Env` namespace).
  Both bac and worker code now share the same nominal type source.

### Migration baseline

- One file: `packages/db/migrations/0000_parallel_blue_blade.sql` (~131 lines, 5 domain tables + 4
  better-auth tables + indexes + foreign keys with the documented cascade/restrict strategy).
- `bun run db:migrate:local` applies cleanly. Local D1 reports 9 user tables (+ 1 internal
  `_cf_METADATA` + `d1_migrations` bookkeeping).
- Re-running `bun run db:generate` against the unchanged schema is a no-op (idempotent).
- Re-running `bun run auth:generate` produces zero diff against the committed
  `packages/db/src/auth.schema.ts` (idempotent).

### Workspace-script wiring

`bun --filter <pkg> exec <bin>` is unreliable when `<bin>` is not a workspace-local script (root
filter resolution silently misses the workspace). Every cross-workspace invocation in this branch
goes through a per-workspace script entry instead:

| Root script        | Delegates via filter to | Workspace script                           |
| ------------------ | ----------------------- | ------------------------------------------ |
| `db:generate`      | `@mizan/db`             | `drizzle-kit generate`                     |
| `db:migrate:local` | `@mizan/worker`         | `wrangler d1 migrations apply DB --local`  |
| `db:migrate:prod`  | `@mizan/worker`         | `wrangler d1 migrations apply DB --remote` |
| `db:seed`          | (direct)                | `bun scripts/seed-users.ts`                |
| `auth:generate`    | `@mizan/db`             | `bunx @better-auth/cli generate …`         |

### Test baseline

- Vitest globalSetup at `apps/worker/tests/setup/migrations.ts` reads the D1 migration files once
  per test process via `readD1Migrations(path)` and `provide("migrations", …)`. Each integration
  test calls `applyD1Migrations(env.DB, inject("migrations"))` in `beforeAll`.
- 4 unit suites (`require-role`, `idempotency-key`, `schema-shape`, `zod-refinements`) + 4
  integration suites (`auth-flow`, `role-gating`, `idempotency-replay`, `rate-limit`) + the Phase
  0 `health` smoke = 9 test files.
- `.oxlintrc.json` test-file override extended to also disable `consistent-type-assertions`,
  `no-unsafe-argument`, and `no-unsafe-return` so mocks can be constructed without an inflexible
  cast-ban. Production code retains the strict no-cast contract.

### Curl-driven acceptance sequence

Booted via `bun --filter @mizan/worker dev`; baseline captured against `wrangler dev` on port 8788. Each row records the exact request and the observed response — re-run from a clean local D1
should match.

| #   | Request                                                                                                                                                         | Expected response                                                                          | Notes                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | `bun run db:seed`                                                                                                                                               | exit 0; prints `seeded reviewer@mizan.test (reviewer)` + `seeded admin@mizan.test (admin)` | idempotent; re-run treats 422 as success and the admin role UPDATE as a no-op |
| 2   | `curl -s -c /tmp/c -XPOST $BASE/api/auth/sign-in/email -H 'Content-Type: application/json' -d '{"email":"admin@mizan.test","password":"admin-dev-only-12345"}'` | 200 + Set-Cookie                                                                           | better-auth sign-in via email/password                                        |
| 3   | `curl -s -b /tmp/c $BASE/api/me`                                                                                                                                | 200, `{user: {id, email, role: "admin"}}`                                                  | role read from `additionalFields.role`                                        |
| 4   | `curl -s -b /tmp/c $BASE/api/admin/ping`                                                                                                                        | 200, `{ok: true}`                                                                          | role-gate passes for admin                                                    |
| 5   | First `curl -XPOST $BASE/api/admin/echo -H 'Idempotency-Key: <uuid1>' …`                                                                                        | 200, body with fresh `echoedAt`                                                            | KV write happens after handler completes                                      |
| 6   | Same key replay                                                                                                                                                 | 200 + `Idempotency-Replay: true` header + identical body                                   | KV hit; handler not re-invoked                                                |
| 7   | Reviewer cookie + `curl $BASE/api/admin/ping`                                                                                                                   | 403, `{error: "Forbidden"}`                                                                | role-gate denies non-admin                                                    |
| 8   | No cookie + `curl $BASE/api/me`                                                                                                                                 | 401, `{error: "Unauthorized"}`                                                             | session lookup fails fast                                                     |

## Phase 3 delta (2026-05-21)

### Dep additions vs Phase 2

| Workspace         | Dep           | Version | Notes                                              |
| ----------------- | ------------- | ------- | -------------------------------------------------- |
| `apps/worker`     | `expect-type` | 1.3.0   | devDep; replaces vitest's `expectTypeOf` re-export |
| `apps/worker`     | `@types/bun`  | 1.3.13  | devDep; bun:test types for unit tests              |
| `apps/web`        | `@types/bun`  | 1.3.13  | devDep; bun:test types for web unit test           |
| `packages/mastra` | `@mastra/rag` | 2.2.1   | corpus chunking via `MDocument`                    |

### Dep removals vs Phase 2

| Workspace  | Dep         | Reason                          |
| ---------- | ----------- | ------------------------------- |
| `apps/web` | `vitest`    | replaced by bun test            |
| `apps/web` | `happy-dom` | not used by remaining web tests |

### CVE re-surfacing + overrides

- No new HIGH CVE surfaced (`expect-type` and `@mastra/rag` add no new audit failures).
- Post-install `bun audit --audit-level=high` exits 0.

### Tracked upstream type skew

- No new `@ts-expect-error` markers. Phase 1's single marker on `apps/worker/src/auth/index.ts` is untouched.
- `@mastra/rag@2.2.1` required over brainstorm-pinned `1.3.6` — peer dep mismatch with `@mastra/core@1.32.1`.

### Test infrastructure split

- Worker unit tests + web tests: `bun test` (native).
- Worker integration tests + eval smoke: vitest + `@cloudflare/vitest-pool-workers` (vendor-locked).
- Pre-push lefthook `vitest-import-gate` enforces the split.
- `apps/worker/vitest.config.ts` keeps a single `integration` project (cloudflareTest plugin must live inside `test.projects[]`).

### Policy RAG infrastructure

| Resource / artifact | Detail                                                               |
| ------------------- | -------------------------------------------------------------------- |
| Vectorize index     | `mizan-policy-corpus` — dim=1536, metric=cosine                      |
| Metadata index      | `source` field indexed for zakat/safety filtering                    |
| Corpus files        | `packages/mastra/src/corpus/zakat-policy.json`, `safety-policy.json` |
| Ingestion           | `bun run embed-corpus` → `scripts/embed-corpus.ts`                   |
| Workflow step       | `matchPolicy` between extractors and `composeBrief`                  |

### Curl-driven Phase 3 acceptance (manual — integration tests local-only)

| #   | Step                                                             | Expected                                                     | Notes                               |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| 1   | `wrangler vectorize info mizan-policy-corpus`                    | dim=1536, metric=cosine, source metadata index present       | U1                                  |
| 2   | `MOCK_LLM_RESPONSES=1 bun run embed-corpus -- --dry-run`         | exit 0; reports upserted count > 0                           | U4 (no OpenAI key needed with mock) |
| 3   | `bun run embed-corpus` (with `OPENAI_API_KEY`)                   | exit 0; vectorsCount > 0                                     | U4 production path                  |
| 4   | Admin POST `/api/cases/case-001/brief`                           | 200 SSE; `policy_citations.length >= 2`; clauseIds in corpus | U6 + U7                             |
| 5   | `bun --filter @mizan/worker test:integration`                    | exit 0; `policy-rag.test.ts` passes                          | U8 — slow; run locally              |
| 6   | `grep -rE 'from \"vitest\"' apps/web/src apps/worker/tests/unit` | zero matches                                                 | U10                                 |
| 7   | `lefthook run pre-push`                                          | exit 0 on clean branch                                       | U11                                 |

## Phase 4 delta (2026-05-22)

### Dep additions vs Phase 3

| Workspace | Dep | Version | Notes                                                         |
| --------- | --- | ------- | ------------------------------------------------------------- |
| —         | —   | —       | Zero new top-level deps; Phase 3 stack covers Phase 4 surface |

### CVE re-surfacing + overrides

- No new HIGH CVE surfaced after Phase 4 land.
- Post-install `bun audit --audit-level=high` exits 0.

### Test infrastructure additions

| Artifact         | Detail                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests       | 7 new bun:test files under `apps/worker/tests/unit/` (geography-tier, mocks, vouching schema, verification path, force-escalate truth table, draft prompt) |
| Integration test | `apps/worker/tests/integration/phase-4-workflow.test.ts` — community-vouching E2E (local-only; not CI-gated)                                               |
| Eval smoke       | `packages/eval/src/smoke-001.eval.ts` — case-008 forced-escalate shape assertion                                                                           |
| Seed cases       | 3 JSON files at `packages/mastra/src/seeds/community-vouching/` (case-006/007/008)                                                                         |

### D1 migration

| Migration                         | Detail                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `0002_awesome_the_liberteens.sql` | `CREATE UNIQUE INDEX signals_case_run_type_uniq ON signals (case_id, run_id, signal_type)` |

### Workflow chain

Phase 4 extends the brief workflow from 8 → 14 steps: `photoSignal`, `storyCoherence`, `classifyVouchingChain`, `computeVerificationPath`, `draftOrganizerMessage`, `forcedEscalateGate` inserted per canonical order in `packages/mastra/src/workflows/brief.workflow.ts`.
