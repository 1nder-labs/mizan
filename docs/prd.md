---
title: Mizan Review Desk — PRD
owner: Lahfir
date: 2026-05-19
status: ready-to-build
target: LaunchGood Applied AI Engineer application
audience: LaunchGood Head of Engineering + Trust & Safety lead
artifact: deployed prototype + ≤5min walkthrough video
---

# Mizan Review Desk

Internal AI review-brief tool for LaunchGood's Trust & Safety / Zakat team. Takes campaign materials LaunchGood already collects (creator ID, bank statement, beneficiary ID, category-specific docs, campaign text), extracts structured fields, matches claims to LaunchGood's published policy, surfaces missing evidence and trust-chain signals, and produces a cited human-review brief. AI never decides; reviewer always acts; every action becomes an eval case.

## 1. Problem

LaunchGood's 10-person team manually reviews campaigns across 155 countries. Per campaign, a reviewer:

- Opens the admin tool, reads the story
- Opens the organizer profile in a separate tab, eyeballs uploaded ID + bank statement
- Opens LaunchGood Zakat Policy in another tab, re-reads relevant clauses
- Squints at category-specific docs (hospital bill, school letter, org registration)
- Mentally calculates what's missing
- Writes a generic "please provide more info" email
- Logs a decision

Estimated ~12 minutes per engaged-with campaign. Ramadan stress (~2× volume, $48M concentration) is the worst time to be slow. Decisions are inconsistent across reviewers; organizer cure cycles are slow because reviewer asks are generic; the Zakat team gets pulled into mechanical cases where the actual interpretive content is small.

## 2. Target user

**Primary: Trust & Safety reviewer** ("Aisha"). 10-person team. ~50 campaigns/day, ~100/day in Ramadan. Familiar with LaunchGood policy. Currently uses admin tool + policy doc + email.

**Secondary: Senior reviewer / Zakat team lead.** Receives escalations for community-vouching cases and genuine policy edge cases.

**Tertiary (downstream beneficiary): Organizer.** Faster, more specific cure cycle when docs are missing.

**Not the user:** the donor, the beneficiary, the public-facing site, the scholar (scholars do not participate in current verification per LaunchGood's own policy).

## 3. Goal

**This is an MVP / demo, not a full internal product.** Showcase Applied AI Engineering skills against a concrete LaunchGood-shaped problem: multi-agent orchestration, RAG, tool use, streaming, HITL suspend/resume, tracing + observability, a small eval harness, and a provider-agnostic LLM substrate.

The "problem" it solves (Zakat review brief generation) is real and grounded in LaunchGood's published policy + support center — but the deliverable is a recruiter-evaluatable artifact, not a production rollout. If hired, the same substrate extends to other internal workflows; that extension is not in this PRD's scope.

Skills the demo must visibly prove:

- Orchestration — Mastra multi-step workflow with branching + suspend/resume
- RAG — Vectorize-backed retrieval over LaunchGood's published policy
- Tool use — typed tools called inside Mastra steps (doc extractors, registry lookups, drafted-message generator)
- Streaming — Mastra workflow `.stream()` → AI SDK UI message parts → live reviewer UI
- HITL — explicit `.suspend()` at the reviewer gate; `.resume()` with the reviewer action
- Tracing + observability — `@mastra/observability` shipping traces to local Langfuse; demo video shows the dashboard
- Eval harness — Vitest spec running locally against seeded gold set; provider-swap regression check
- Agnostic LLM — provider factory works across Anthropic, OpenAI, OpenRouter via env-var switch

## 4. Non-goals (the load-bearing list — these are scope rules)

1. **No verification of unverifiable cases.** AI surfaces trust-chain; refuses false low-risk scores on no-documentary-path cases.
2. **No fatwa-issuing.** Interpretive religious questions → ESCALATE. Corpus is LaunchGood's own published policy only; no IslamQA, no AAOIFI, no classical fiqh manuals, no external fatwas.
3. **No live scraping of LaunchGood, organizer sites, or third parties.** Per LaunchGood ToU + general ethical default.
4. **No auto-approval.** Every decision goes through a human reviewer.
5. **No replacement of existing LaunchGood systems** (admin tool, payments, KYC vendor, sanctions provider). Mizan is a brief generator + review queue; reuses existing infrastructure in production.
6. **No fake real-data integration in the demo.** All external systems (IRS Pub 78, KYC vendor, sanctions API, reverse image search) are mocked with realistic fake responses. Demo is explicit about what is real vs mocked.
7. **No customer-facing surface.** Internal-only. Organizers never see Mizan; they see their existing campaign-creation UI + the drafted ask Mizan generates for the reviewer to send.
8. **No multi-tenant or org-modeling complexity in the demo.** Two roles only: reviewer + admin.
9. **No production-grade auth flows in the demo** (invite flows, SSO, billing). `better-auth-cloudflare` w/ D1 + KV + R2 + email/password is sufficient.
10. **No provider lock-in.** Every LLM call routes through the provider factory (`getModel({provider, model})`); swap by env var.
11. **No external infrastructure beyond LLM providers.** Storage, compute, vector search, object storage, queues, auth — all Cloudflare-native. Langfuse runs locally only (Docker), not in production.
12. **No four-agent architecture theatre.** Single Mastra workflow with layered steps. Each layer is one Mastra `createStep`, not a separate "agent" for marketing.

## 5. Success metrics

### What the submission must show

- Deployed URL on `mizan.<slug>.workers.dev` where the recruiter walks through 5+ seeded cases end-to-end
- ≤5min walkthrough video covering: the problem framing, live brief generation with streaming, HITL suspend/resume reviewer action, Langfuse trace dashboard, eval spec output, provider swap demonstration
- Reviewer-time-per-case on seeded cases: documentary ≤60s, missing-docs ≤90s, community-vouching ≤3min
- Local eval spec: ≥90% precision on block recommendations, <5% false-positive on known-clean control, average LLM cost <$0.10 per brief (measured from Langfuse traces)
- Reviewer flow correctly intercepts a structurally-failing seeded case without accusatorial framing
- Provider swap demo: same case runs end-to-end across Anthropic + OpenAI + OpenRouter by changing `DEFAULT_LLM_PROVIDER` env var; brief shape stable across providers

## 6. Phased plan (11 phases — bootstrap → ship)

Each phase ends in a demoable milestone. No time or effort estimates — order matters; pace does not. Every phase follows the structure mandated in `~/Documents/Projects/personal/CLAUDE.md` (Goal → Force-read internal → Force-read external via context7 → In scope → Out of scope → Deliverable → Acceptance criteria → Implementation notes → Tests). An agent implementing one phase reads ONLY that phase + its force-read links.

### Deployment policy (NON-NEGOTIABLE)

- **`wrangler dev` (Miniflare) is the development surface for Phases 0–9.** Local D1, R2, Vectorize, KV, Queue bindings simulated with full fidelity. Every acceptance criterion through Phase 9 is reachable locally.
- **Production deploy via `wrangler deploy` happens ONLY in Phase 10.**
- Mid-phase exception: if a deployment-only issue surfaces (e.g., a binding misconfig that Miniflare doesn't catch), a one-off probe deploy to a throwaway `*-staging.workers.dev` URL is acceptable to debug — followed by tearing the deploy down and returning to local-only work until Phase 10. No partial production deploys persist between phases.
- Rationale: production deploys consume secrets, claim a public URL, and create observability noise. Until the artifact is the artifact, every push goes through local-only.

### Coding principles (NON-NEGOTIABLE)

Every phase enforces the seven coding principles in `~/Documents/Projects/personal/CLAUDE.md` (file ≤400 LOC, function ≤50 LOC, clean + modular, no `any` / no `as` / no leaked `unknown`, no inline comments / only docstrings, no dead code via knip, no band-aids). Phase 0 wires the enforcement stack (oxlint rules + knip + grep-based pre-commit hook + `bun run lint && bun run knip && bun run typecheck && bun run test` CI gate). Every subsequent phase ships code that already passes this gate before being merged.

---

### Phase 0 — Greenfield bootstrap (Bun monorepo + Cloudflare bindings + oxc toolchain)

**Goal:** Bun workspaces monorepo scaffolded with `apps/worker` + `apps/web` + 4 packages; all Cloudflare bindings provisioned via CLI; oxlint + oxfmt configured; hello-world Hono route + Vitest smoke test green. Nothing else.

**Force-read (internal — MUST read before implementing):**

- [ ] §7 Stack decisions — every binding + package + tooling choice pinned (Bun, oxlint, oxfmt, workspace layout)
- [ ] §10 Concrete file layout — the monorepo tree this phase scaffolds
- [ ] §11 wrangler.jsonc shape — copy binding skeleton into `apps/worker/wrangler.jsonc`
- [ ] §12 Best-practices checklist — Cloudflare section + Bun workspaces gotchas

**Force-read (external via context7 — MUST query before implementing):**

- [ ] context7 `/oven-sh/bun` — query: "workspaces setup in root package.json; bun install behavior; bun --filter for cross-workspace scripts; workspace:\* dependency syntax"
- [ ] context7 `/websites/oxc_rs_guide_usage` — query: "oxlint --init scaffolding; .oxlintrc.json config reference with plugins (typescript, import, unicorn, oxc, react); overrides for test files; running oxlint via bun"
- [ ] context7 `/mastra-ai/mastra` — query: "minimum project setup; Mastra instance with D1Store on Cloudflare Workers"
- [ ] Cloudflare docs (`cloudflare:cloudflare` skill, `references/wrangler`) — query: "wrangler d1 create, wrangler kv namespace create, wrangler r2 bucket create, wrangler vectorize create-index --dimensions=1536 --metric=cosine, wrangler queues create commands; assets binding for SPA in apps/web"
- [ ] context7 `/honojs/hono` — query: "minimal Hono app on Cloudflare Workers; Bindings + Variables typing"

**In scope:**

_Monorepo scaffolding:_

- `bun init` at the repo root
- Root `package.json` w/ `"workspaces": ["apps/*", "packages/*"]` + scripts (`dev`, `build`, `test`, `lint`, `format`, `typecheck`, `eval`)
- Workspace dirs created: `apps/worker`, `apps/web`, `packages/db`, `packages/mastra`, `packages/shared`, `packages/eval`
- Each workspace has its own `package.json` w/ scoped name (`@mizan/worker`, `@mizan/web`, `@mizan/db`, `@mizan/mastra`, `@mizan/shared`, `@mizan/eval`) + `tsconfig.json` extending root `tsconfig.base.json`
- Cross-workspace deps via `"@mizan/db": "workspace:*"` etc.

_Cloudflare bindings provisioning (CLI):_

- `wrangler d1 create mizan` → paste UUID into `apps/worker/wrangler.jsonc`
- `wrangler kv namespace create mizan-kv` → paste ID
- `wrangler r2 bucket create mizan-uploads`
- `wrangler vectorize create-index mizan-policy-corpus --dimensions=1536 --metric=cosine`
- `wrangler queues create mizan-brief-jobs` + `wrangler queues create mizan-brief-jobs-dlq`
- `apps/worker/wrangler.jsonc` w/ all bindings + `compatibility_date` pinned + `compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"]` (Mastra's canonical pair) + `observability: { enabled: true }` + `assets` binding for `apps/web/dist`

_Dependencies (Bun, scoped per workspace):_

- `apps/worker`: `hono`, `mastra`, `@mastra/cloudflare-d1`, `@mastra/hono`, `@mastra/ai-sdk`, `@mastra/observability`, `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@openrouter/ai-sdk-provider`, `better-auth`, `better-auth-cloudflare`, `@better-auth/drizzle-adapter`, `drizzle-orm`, `zod`, `@mizan/db: workspace:*`, `@mizan/mastra: workspace:*`, `@mizan/shared: workspace:*`
- `apps/web`: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `ai` (for `useChat`), `tailwindcss`, `@tailwindcss/vite` (Tailwind 4 Vite plugin — replaces the legacy PostCSS pipeline), `@mizan/shared: workspace:*`; shadcn deps after `bunx shadcn@latest init`
- `packages/db`: `drizzle-orm`, `drizzle-kit`, `@better-auth/cli`
- `packages/mastra`: `mastra`, `@mastra/cloudflare-d1`, `@mastra/observability`, `ai`, `@ai-sdk/*`, `zod`
- `packages/shared`: `zod`
- `packages/eval`: `vitest`, `@mizan/mastra: workspace:*`
- Root devDeps: `oxlint`, `oxfmt`, `knip`, `lefthook`, `typescript`, `vitest`, `@cloudflare/vitest-pool-workers`, `@cloudflare/workers-types`, `wrangler`, `tsx`, `@socketsecurity/bun-security-scanner`

_Tooling config (root):_

- `bunfig.toml` (repo root) — supply-chain security stack (see §12 Bun workspaces for the canonical shape):
  - `[install] exact = true` — pin exact versions in `package.json`; no caret ranges
  - `[install] saveTextLockfile = true` — text JSONC lockfile (`bun.lock`); never the legacy binary `bun.lockb`
  - `[install] minimumReleaseAge = 1209600` — 14-day bake period before any new version installs
  - `[install] minimumReleaseAgeExcludes = ["typescript", "@types/node", "@cloudflare/workers-types", "wrangler", "@socketsecurity/bun-security-scanner"]` — scanner is on the exclude list so its own emergency updates bypass the 14-day bake (threat intel itself can't lag the attack window)
  - `[install] ignoreScripts = true` — lifecycle scripts blocked unless package is in `trustedDependencies`
  - `[install] registry = "https://registry.npmjs.org"` — registry locked explicitly
  - `[install.security] scanner = "@socketsecurity/bun-security-scanner"` — Bun 1.3 Security Scanner API; blocks installs of malicious / hijacked packages
- Root `package.json` includes `"packageManager": "bun@<exact-version>"`, `"engines": { "bun": ">=1.3.11" }`, and `"trustedDependencies": []` (empty by default; additions require PR review)
- `oxlint --init` → `.oxlintrc.json` w/ plugins `["typescript", "import", "unicorn", "oxc", "react"]`, `env: { browser: true, node: true, worker: true }`, and the FULL non-negotiable rule set from this repo's `CLAUDE.md` (§7 / Non-Negotiable Coding Principles):
  - `max-lines: ["error", 400]`
  - `max-lines-per-function: ["error", 50]`
  - `typescript/no-explicit-any: error`
  - `typescript/consistent-type-assertions: ["error", { assertionStyle: "never" }]`
  - `typescript/no-unsafe-assignment: error`
  - `typescript/no-unsafe-argument: error`
  - `typescript/no-unsafe-return: error`
  - `typescript/no-floating-promises: error`
  - `no-warning-comments: ["error", { terms: ["TODO", "FIXME", "HACK", "XXX"], location: "anywhere" }]`
  - Overrides for `**/*.test.ts` + `**/tests/**` relax only `typescript/no-explicit-any` + `no-unsafe-assignment`
- `tsconfig.base.json` w/ `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, `"moduleResolution": "bundler"`, paths for `@mizan/*` mapping to workspace srcs
- `knip.json` w/ workspace entry points (`apps/worker/src/index.ts`, `apps/web/src/main.tsx`); ignore lists for legitimate test-only false positives
- `renovate.json` w/ `"minimumReleaseAge": "14 days"`, `"rangeStrategy": "pin"`, `"internalChecksFilter": "strict"`, vulnerability alerts bypass the bake period
- Pre-commit hook (lefthook) runs in parallel:
  - `bun run lint` (oxlint)
  - `bun run typecheck` (tsc --noEmit per workspace)
  - `bun run knip` (dead-code check)
  - `bun audit --audit-level=high --prod` (block on HIGH/CRITICAL CVEs)
  - Grep belt-and-braces: fails commit if any non-test file contains `as any`, `as unknown`, `: any` (outside test overrides), `// TODO\|FIXME\|HACK\|XXX`, or `// @ts-nocheck`
- Pre-push hook (lefthook) runs `bun --filter '*' test`
- `apps/web/components.json` after `bunx shadcn@latest init` (Tailwind 4 base config emitted; uses `@tailwindcss/vite` plugin, not the legacy PostCSS pipeline)

_Initial code:_

- `apps/worker/src/index.ts` Hono app w/ `GET /health` returning `{ status: "ok", bindings: ["DB","R2_BUCKET","VECTORIZE","KV","BRIEF_QUEUE"], runtime: "cloudflare-workers" }`
- `apps/web/src/main.tsx` blank Vite + React + Tailwind 4 skeleton (Tailwind 4 via `@tailwindcss/vite` plugin, CSS-first `@theme` block in `apps/web/src/index.css`, no `tailwind.config.ts`, no `postcss.config.mjs`); one shadcn `<Button>` rendered as smoke
- `apps/worker/tests/health.test.ts` Vitest spec against Miniflare confirming `/health` returns 200 + all bindings present in env

_Other:_

- `docker/docker-compose.langfuse.yml` (NOT yet wired — file present only)
- `README.md` skeleton + `.env.example` + `.dev.vars.example`

**Out of scope:** Any business logic, any LLM call, any schema, any auth, any actual UI.

**Deliverable:** `bun --filter @mizan/worker dev` boots Worker; `curl localhost:8787/health` returns 200 with binding inventory. `bun --filter @mizan/web dev` boots Vite client showing the shadcn Button. `bun run lint` passes. `bun run format` runs cleanly. `bun --filter @mizan/worker test` passes the smoke test.

**Acceptance criteria:**

- `bun install` resolves all deps with the Socket security scanner active and reports clean; `bun.lock` (text JSONC) written and committed
- `bun install --frozen-lockfile --no-cache` exits 0 on a clean clone (CI gate)
- `bun audit --audit-level=high` exits 0 (no HIGH or CRITICAL CVEs)
- `bun --filter @mizan/worker dev` boots without errors
- `/health` confirms every binding is present
- `bun --filter @mizan/web dev` boots Vite at `localhost:5173` rendering shadcn Button
- `bun run lint` exits 0 (oxlint w/ full non-negotiable rule set active)
- `bun run typecheck` exits 0 (tsc --noEmit per workspace, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- `bun run knip` exits 0 (no dead code in scaffold)
- `bun run format:check` exits 0
- `bun --filter '*' test` runs the smoke test green
- `bunfig.toml` present at repo root with the §6 Phase 0 / §12 Bun workspaces canonical settings (scanner + minimumReleaseAge + ignoreScripts + exact + saveTextLockfile + registry lock)
- `lefthook.yml` present; `bunx lefthook install` writes `.git/hooks/pre-commit` + `.git/hooks/pre-push`
- Pre-commit hook installed and active: a deliberate `// TODO` in any source file fails the commit; a deliberate `as any` in any non-test source file fails the commit
- `renovate.json` present and valid (`bunx renovate-config-validator`)
- `docker compose -f docker/docker-compose.langfuse.yml up -d` starts Langfuse at `http://localhost:3001` (verify only; tear down after)
- **NO production `wrangler deploy` in this phase.** Only `wrangler dev` (local Miniflare).

**Implementation notes:**

- `bun.lock` (text JSONC) IS committed — Bun 1.2+ default lockfile format. The legacy binary `bun.lockb` MUST NOT be committed; `.gitignore` enforces this defensively.
- Every dependency installed at its absolute latest version (resolved via `bun pm view <pkg> version`) and pinned exact (no caret ranges) by `install.exact = true`. Reproducibility is non-negotiable.
- Bun version pinned via `"packageManager": "bun@<exact-version>"`; CI uses `oven-sh/setup-bun` w/ `bun-version-file: package.json` to match exactly.
- Supply-chain security stack is layered: Socket scanner blocks malicious installs → `minimumReleaseAge: 1209600` (14 days) blocks unseasoned versions → `ignoreScripts = true` blocks lifecycle code → `trustedDependencies` is the explicit allowlist for any required postinstall → `bun audit` gates pre-commit + CI → `bun install --frozen-lockfile --no-cache` in CI → Renovate `minimumReleaseAge: "14 days"` keeps the upgrade cadence consistent with the install policy.
- Root `package.json` scripts use `bun --filter`:
  - `"dev": "bun --filter '*' dev"` (parallel dev servers)
  - `"build": "bun --filter '*' build"`
  - `"test": "bun --filter '*' test"`
  - `"lint": "oxlint"`
  - `"format": "oxfmt --write ."`
  - `"format:check": "oxfmt --check ."`
  - `"typecheck": "bun --filter '*' typecheck"`
  - `"audit": "bun audit --audit-level=high"`
  - `"audit:prod": "bun audit --audit-level=high --prod"`
  - `"knip": "knip"`
- Pin `compatibility_date` to `2026-05-19` (the date Phase 0 ships); bump deliberately
- `compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"]` — exact pair Mastra's `CloudflareDeployer` generates; `nodejs_compat` at compat date 2026-05-19 implicitly activates `nodejs_compat_v2` semantics (do NOT add a literal `nodejs_compat_v2` string)
- DO NOT commit `.dev.vars` — gitignored
- Lefthook installs hooks via `bunx lefthook install` AFTER `bun install` (lefthook's own postinstall is blocked by `ignoreScripts = true`); document this in README.md
- If the Socket scanner's package itself has a postinstall, audit the script before adding `@socketsecurity/bun-security-scanner` to `trustedDependencies` (do not blanket-trust the scanner just because the scanner is itself a security tool)

**Tests (per §7.11):**

- Unit: trivial — health check route returns expected shape (Vitest in `apps/worker/tests/`)
- Integration (Vitest + Miniflare): all bindings accessible in env
- Lint: `bun run lint` is the bar — fails the build on any oxlint error
- E2E: skipped this phase

---

### Phase 1 — Database schema + auth foundation

**Goal:** Drizzle schema for the entire domain; better-auth-cloudflare wired with two roles; signup/signin/role-gating verified end-to-end via curl. No business logic yet.

**Force-read (internal — MUST read before implementing):**

- [ ] Phase 0 — Phase 1 builds on the bootstrapped project; do not re-bootstrap
- [ ] §7 Stack decisions (Auth + UI subsection) — better-auth-cloudflare pattern + Hono per-request init contract
- [ ] §7.10 Idempotency — Layer 1 (HTTP `Idempotency-Key`) middleware ships in this phase
- [ ] §11 wrangler.jsonc shape — D1 binding must be active
- [ ] §12 Best-practices checklist — better-auth section in full (per-request init, server-side getSession only, schema merge, declarative role gating, CSRF, rate limit)

**Force-read (external via context7 — MUST query before implementing):**

- [ ] context7 `/zpg6/better-auth-cloudflare` — query: "withCloudflare({d1, kv, r2}) full setup; createAuth dual-mode for CLI schema gen + runtime; Hono per-request middleware; emailAndPassword config; rateLimit config"
- [ ] context7 `/better-auth/better-auth` — query: "schema generation via @better-auth/cli generate; merging generated schema with domain Drizzle tables; session.create.before vs user.create.after hooks"
- [ ] Cloudflare docs (`cloudflare:cloudflare` skill, `references/d1`) — query: "drizzle-kit generate + wrangler d1 migrations create + wrangler d1 migrations apply --local workflow"
- [ ] context7 `/drizzle-team/drizzle-orm` — query: "drizzle-orm/d1 adapter; SQLite column types appropriate for Cloudflare D1; schema export patterns"
- [ ] context7 `/drizzle-team/drizzle-orm` — query: "drizzle-zod: createSelectSchema, createInsertSchema, createUpdateSchema; refinement overrides; z.infer for TS types"

**In scope:**

- Drizzle schema design at `src/db/schema.ts`:
  - `cases` table — `id` (UUID PK), `status` (enum), `category`, `geography`, `claimed_zakat_category`, `current_run_id`, `brief_partial_json`, `created_at`, `updated_at`, `created_by`
  - `briefs` table — `id`, `case_id` FK, `run_id`, `recommendation`, `confidence`, `composed_at`, `payload_json`
  - `signals` table — `id`, `case_id` FK, `run_id`, `signal_type`, `payload_json`, `recorded_at`
  - `reviewer_actions` table — `id`, `case_id` FK, `run_id`, `reviewer_id` FK to auth user, `action`, `rationale`, `acted_at`, `action_id` (client UUID, UNIQUE)
  - `workflow_events` table — per §7.9 schema
  - `idempotency_keys` table (or KV-only — decide and document)
- better-auth config at `src/auth/index.ts` w/ `withCloudflare({d1, kv, r2})`, email+password, rate limit
- Generated `src/db/auth.schema.ts` via `npx @better-auth/cli generate --config src/auth/index.ts --output src/db/auth.schema.ts -y`
- Schema merge at `src/db/index.ts` exporting `schema = { ...authSchema, cases, briefs, signals, reviewer_actions, workflow_events }`
- `src/db/zod.ts` exporting drizzle-zod generated schemas: `selectCasesSchema`, `insertCasesSchema`, `updateCasesSchema` + same for briefs/signals/reviewer_actions/workflow_events; refinement overrides where needed (e.g., status enum narrowing, `action_id` as UUID); `z.infer<>` exports for TS types
- drizzle-kit generates migration → `wrangler d1 migrations apply DATABASE --local`
- Hono middleware:
  - Per-request `c.set("auth", createAuth(c.env, c.req.raw.cf, baseURL))`
  - `requireRole(role)` factory (declarative, attached via `.use()` on route groups)
  - `Idempotency-Key` middleware w/ KV cache (per §7.10 Layer 1)
- Routes (chained via `.post().get()` so types compose):
  - `/api/auth/*` (mounted via better-auth handler)
  - `GET /api/me` (returns session) — uses `requireRole`
  - `GET /api/admin/ping` — `requireRole('admin')` gate
- `@hono/zod-validator` middleware wired into the chain pattern; example route validates body with a shared `@mizan/shared` zod schema
- `apps/worker/src/index.ts` exports `export type AppType = typeof app` at the bottom
- `packages/shared/src/app-type.ts` re-exports `AppType` so `apps/web` imports it from `@mizan/shared/app-type` (stable path, no cross-app reach)
- Seed script `scripts/seed-users.ts` creating one `reviewer@mizan.test` + one `admin@mizan.test`

**Out of scope:** Mastra workflow, doc extractors, RAG, UI, observability.

**Deliverable:** `curl` against running Worker can sign up, sign in, fetch session, hit role-gated routes. Schema deployed to local D1.

**Acceptance criteria:**

- `wrangler d1 migrations apply --local` succeeds; D1 has all tables
- `POST /api/auth/sign-up/email` creates a user
- `POST /api/auth/sign-in/email` returns a session
- `GET /api/me` w/ session cookie returns user + role
- `GET /api/admin/ping` returns 403 for reviewer role, 200 for admin
- `Idempotency-Key` middleware: POST twice with same key → second returns `Idempotency-Replay: true` + identical body

**Implementation notes:**

- NEVER use a module-singleton `auth`; env bindings are per-request on Workers
- Use `session.create.before` hook NOT `user.create.after` for any session-level data injection (documented past pitfall causing redirect loops)
- D1 doesn't support RLS — enforce tenant/role checks in middleware + queries
- `requireRole` is declarative: applied via `app.use('/api/admin/*', requireRole('admin'))`, NOT body-level `if (session.role !== 'admin')` calls
- Idempotency keys stored in KV with 24h TTL; key = client-supplied UUID v4

**Tests (per §7.11):**

- Unit: `requireRole` middleware factory (mocked session); Idempotency-Key middleware (mocked KV); Drizzle schema shape (compile-time TS check via `expectTypeOf`)
- Integration (Vitest + Miniflare): full auth flow (signup → signin → session lookup → signout) against real D1 + KV bindings; role gating; Idempotency-Key replay
- E2E: skipped this phase

---

### Phase 2 — Documentary brief workflow (LLM core, JSON output)

**Goal:** Mastra workflow generates structured briefs for the 5 documentary-bucket seeded cases. No UI — output is JSON. This is the LLM-core proof.

**Force-read (internal — MUST read before implementing):**

- [ ] §7.5 Architecture detail — Mode A streaming pattern (used here, even though there's no UI yet — endpoint streams JSON via SSE)
- [ ] §7.6 LLM Provider Factory — every LLM call routes through `getModel({provider, model})`; no direct provider imports
- [ ] §7.11 Testing — unit + integration contract for steps, schemas, workflow runs
- [ ] §12 Best-practices checklist — Vercel AI SDK section in full (zod no .min/.max for strict providers, clamp post-parse, abort signals, telemetry on every call, provider abstraction discipline)

**Force-read (external via context7 — MUST query before implementing):**

- [ ] context7 `/mastra-ai/mastra` — query: "createWorkflow + createStep with zod input/output schemas; D1Store storage adapter wiring on Cloudflare Workers; workflow.createRun().stream() vs .start()"
- [ ] context7 `/vercel/ai` — query: "generateObject with zod schema; multimodal vision input from Uint8Array buffer; experimental_telemetry config; abort signals"
- [ ] context7 `/mastra-ai/mastra` — query: "toAISdkStream({from: 'workflow', version: 'v6'}) from @mastra/ai-sdk; createUIMessageStream + createUIMessageStreamResponse from ai package"

**In scope:**

- LLM provider factory at `src/mastra/models/factory.ts`: `getModel({provider, model})` returning `withMastra(providerImpl(model), opts)` for Anthropic / OpenAI / OpenRouter
- Mastra instance at `src/mastra/index.ts` w/ `D1Store({binding: env.DB})`
- Mastra workflow at `src/mastra/workflows/brief.workflow.ts` w/ steps wired via `.then()`:
  - `classifyCampaign` (deterministic; routes documentary path)
  - `extractCreatorIdDoc` (multimodal `generateObject`)
  - `extractBankStatement`
  - `extractCategoryDocs` (per-category extractor for medical / school / org registration)
  - `extractStoryClaims`
  - `composeBrief` (assembles all extractions into structured brief — recommendation + missing-docs table + reviewer questions)
- zod schemas for every extractor output + the final brief
- 5 seeded fake-data documentary cases at `src/seeds/documentary/*.json` (anonymized public examples; realistic docs)
- Hono endpoint `POST /api/cases/:id/brief`:
  - Loads case from D1
  - Creates Mastra run: `workflow.createRun()`
  - Streams via `toAISdkStream(run.stream(), {from: 'workflow', version: 'v6'})` + `createUIMessageStreamResponse`
  - No HITL yet — workflow runs straight through

**Out of scope:** Auth-gating (use a fake reviewer session for now), policy RAG (Phase 3), trust signals (Phase 4), queue (Phase 5), UI (Phase 6), HITL (Phase 7), observability (Phase 8).

**Deliverable:** `POST /api/cases/:caseId/brief` with `Accept: text/event-stream` streams a full brief for any of the 5 seeded cases. JSON-only output. wrangler dev demo via curl + httpie.

**Acceptance criteria:**

- All 5 documentary seeded cases produce a structured brief
- Document extractors pull ≥90% of structured fields on seed set
- Brief includes: `recommendation`, `missing_docs[]`, `reviewer_questions[]`, `extracted_claims{}`, `confidence`
- Provider factory grep: zero direct `@ai-sdk/anthropic|openai|openrouter` imports outside `src/mastra/models/factory.ts`
- `c.req.raw.signal` passed through every `generateObject` call (verified by integration test that aborts mid-call)

**Implementation notes:**

- zod schemas: NO `.min()` / `.max()` / `.regex()` on Anthropic/OpenAI strict-mode fields — clamp + validate post-parse in TypeScript helpers (`src/lib/clamp.ts`)
- Multimodal input as `Uint8Array` buffers (not base64) to save Workers memory
- Small/fast models (`claude-haiku-4-5`, `gpt-4o-mini`) for deterministic extractions; reasoning model only for `composeBrief`
- **Langfuse observability contract (wired here, dashboarded in Phase 8):** every LLM call in Phase 2 ships with the full Langfuse-compatible telemetry envelope so Phase 8 only has to start the local stack + set `LANGFUSE_HOST` to light up the trace tree. Pattern is verified against `/langfuse/langfuse-docs` 2026-05.

  **(1) Root span wraps each workflow run.** At the top of `POST /api/cases/:id/brief`, open a manual root span via `startObservation` from `@langfuse/tracing` BEFORE the Mastra `workflow.createRun()` call:

  ```ts
  import { startObservation } from "@langfuse/tracing";
  const runId = crypto.randomUUID(); // UUID v4; v7 if/when Workers support it
  const rootSpan = startObservation("brief.generate", {
    input: { caseId, category, geography },
    // Grouping fields go ON THE SPAN, not in metadata — these are first-class
    // Langfuse filter dimensions in 2026-05 UI:
  });
  rootSpan.update({
    sessionId: runtimeContext.sessionId ?? undefined,
    userId: runtimeContext.reviewerId ?? undefined,
  });
  // ... Mastra run inside this span context ...
  rootSpan.update({ output: brief }).end();
  await langfuseSpanProcessor.forceFlush(); // mandatory on Workers
  ```

  Every nested AI SDK call inside this root span auto-attaches as a child via the OTel parent context. Token usage rolls up per node in the Langfuse UI automatically.

  **(2) `runtimeContext` carries the IDs that aren't grouping dimensions.** Lock this shape at Phase 2: `{ runId: string, caseId: string, reviewerId: string | null, sessionId: string | null }`. `runId` is for our own logs + the eval cost ledger; `caseId` is the business join key; `reviewerId` + `sessionId` flow into the Langfuse span as `userId` + `sessionId`.

  **(3) `experimental_telemetry` on EVERY `generateObject` / `generateText` / `streamObject` / `streamText` call:**

  ```ts
  experimental_telemetry: {
    isEnabled: !!env.LANGFUSE_HOST,
    functionId: `${stepName}.${callPurpose}`,                // "extractCreatorIdDoc.parse-name"
    metadata: {
      sessionId: runtimeContext.sessionId ?? undefined,      // Langfuse-recognized
      userId: runtimeContext.reviewerId ?? undefined,        // Langfuse-recognized
      tags: ["mizan", category, geography],                  // Langfuse-recognized; filter chips
      caseId: runtimeContext.caseId,                         // custom
      runId: runtimeContext.runId,                           // custom; correlates with our cost ledger
      stepId: stepName,                                      // custom
      provider, model,                                       // custom; powers Langfuse cost extraction
    },
  }
  ```

  The fields `sessionId`, `userId`, `tags` are the Langfuse-recognized grouping keys — verified via the langfuse-vercel docs (`/langfuse/langfuse-docs`). Do NOT invent keys like `langfuseTraceId` or `langfuseUpdateParent`; trace grouping happens via the OTel parent context (the root span from rule 1), not via metadata keys.

  **(4) Tool calls get per-tool token attribution automatically when wrapped in their own observation:** for any Mastra tool that invokes an LLM, wrap the tool body with `rootSpan.startObservation(toolName, { input, asType: "tool" })` and end it with `output + usageDetails`. The nested LLM call inside the tool body inherits the tool's span context, so token usage rolls up per tool in the Langfuse trace tree:

  ```ts
  const toolObs = parentSpan.startObservation(
    "ocr.extract-id",
    { input: { docKey } },
    { asType: "tool" },
  );
  const result = await generateObject({ ...experimental_telemetry });
  toolObs
    .update({
      output: result.object,
      usageDetails: {
        input: result.usage.promptTokens,
        output: result.usage.completionTokens,
        total: result.usage.totalTokens,
      },
    })
    .end();
  ```

  **(5) Provider factory is the single injection point.** `getModel({provider, model})` in `packages/mastra/src/models/factory.ts` wires the Langfuse OTel exporter via `withMastra` opts — and ONLY there. Grep gate: zero `langfuse-vercel` imports outside the factory file. Single injection keeps the provider abstraction clean and guarantees every model produced anywhere in the codebase is traceable without per-step wiring.

  **(6) Sampling:** `LangfuseExporter({ sampleRate: 1.0, environment: "development" | "production" })` registered once at boot via `registerOTel` from `@vercel/otel`. Dev defaults to 100%; prod default also 100% for Phase 10; tune down only if Langfuse storage becomes a cost concern (revisit in Phase 10 ops review).

  **(7) `forceFlush` mandatory on Workers.** Workers are short-lived; the OTel exporter must be drained before the request handler returns or spans are lost. Helper at `packages/mastra/src/observability/flush.ts` exports `flushLangfuse(): Promise<void>` that calls `langfuseSpanProcessor.forceFlush()`; every Hono route that creates LLM-bearing work calls it in a `c.executionCtx.waitUntil(...)` so the response isn't blocked on the flush.

  **(8) Reviewer-action continuation (forward-compat for Phase 7):** Phase 7's `recordAction` step opens its own `startObservation("reviewer.action", { ..., asType: "event" })` as a child of the SAME root span identified by `runId`. The HITL pause + resume + final action all live on one trace because the same OTel parent context is propagated through `workflow.suspend()` / `workflow.resume()`. Mechanism: Mastra's D1Store persists the OTel trace context alongside the workflow state. Verify in Phase 7 integration test that a suspend+resume produces ONE Langfuse trace, not two.

  **(9) Cost extraction.** Each `generation` span auto-gets cost computed from `model` + `usageDetails`. Langfuse maintains a per-provider pricing table; for self-hosted, drop a `models.json` into the Langfuse project to keep cost accurate for `claude-haiku-4-5`, `gpt-4o-mini`, `claude-opus-4-7`, etc. The `@mizan/eval` cost ledger asserts (in Phase 9) that per-run cost reported by Langfuse matches the eval-side ledger within 5%.

**Tests (per §7.11):**

- Unit: every zod schema (good + bad inputs); provider factory env-var routing; clamp helpers; classifyCampaign deterministic logic
- Integration (Vitest + Miniflare): Mastra workflow end-to-end on 5 seeded cases w/ mocked LLM responses (deterministic canned outputs); abort signal propagation
- Eval (smoke): 1 documentary case via `npm run eval` w/ real LLM — assert recommendation = READY_FOR_REVIEW

---

### Phase 3 — Policy RAG + cited brief composer

**Goal:** Policy retrieval against LaunchGood's published Zakat + Safety policy via Vectorize. Brief composer cites specific policy clauses.

**Force-read (internal — MUST read before implementing):**

- [ ] Phase 2 — Phase 3 ADDS a step to Phase 2's workflow; do not refactor existing steps
- [ ] §7 Stack decisions (Data + Storage subsection) — Vectorize direct-binding pattern (Mastra RAG primitives produce embeddings; persistence via Workers binding)
- [ ] §11 wrangler.jsonc shape — Vectorize binding must be active w/ dim=1536
- [ ] §12 Best-practices checklist — Cloudflare section (Vectorize dim immutable, index creation, embedding regeneration policy)

**Force-read (external via context7 — MUST query before implementing):**

- [ ] context7 `/mastra-ai/mastra` — query: "MDocument.fromText() + .chunk({strategy: 'recursive', size, overlap}); ModelRouterEmbeddingModel('openai/text-embedding-3-small') + embedMany pipeline"
- [ ] Cloudflare docs (`cloudflare:cloudflare` skill, `references/vectorize`) — query: "Vectorize binding env.VECTORIZE.upsert + .query API; metadata filter; topK pagination; index creation w/ correct dimensions"
- [ ] context7 `/vercel/ai` — query: "embedMany batch embedding; structured output that includes citation arrays referencing retrieved chunks"

**In scope:**

- Policy corpus at `src/corpus/`:
  - `zakat-policy.json` — chunked from launchgood.com/zakatpolicy w/ stable IDs
  - `safety-policy.json` — chunked from launchgood.com/safety
- One-time ingestion script `scripts/embed-corpus.ts`:
  - Loads JSON corpus
  - `MDocument.fromText()` per chunk
  - Embeds via `ModelRouterEmbeddingModel('openai/text-embedding-3-small')` (1536-dim)
  - Upserts to Vectorize via direct binding w/ metadata `{source, clauseId, version}`
- New Mastra workflow step `matchPolicy` at `src/mastra/steps/matchPolicy.ts`:
  - Takes extracted claims from Phase 2 step
  - Embeds the query
  - Queries Vectorize for top-K matching clauses
  - Returns structured `policy_matches[]` with `clauseId`, `excerpt`, `relevance_score`
- Updated `composeBrief` step to include cited clause IDs in `recommendation_rationale` + `policy_citations[]`

**Out of scope:** Trust signals (Phase 4), queue (Phase 5), UI (Phase 6), HITL (Phase 7), observability (Phase 8), eval (Phase 9).

**Deliverable:** All 5 documentary cases now produce briefs that cite specific LaunchGood policy clauses. Vectorize index populated with policy corpus chunks.

**Acceptance criteria:**

- `scripts/embed-corpus.ts` populates Vectorize index successfully
- All 5 cases include at least 2 cited policy clauses in `policy_citations[]`
- Cited clauseId matches a real corpus chunk (no hallucinated citations)
- Vectorize query returns relevant clauses on the seeded test queries (manual eyeballing on the seed set)

**Implementation notes:**

- Vectorize index dim 1536 MUST match `text-embedding-3-small` output; mismatched dim = silent failure at upsert
- Corpus chunks have stable `clauseId` (e.g., `zakat.3.1.a`); citations reference clauseId not vector position
- Vectorize is eventually consistent; wait briefly after upsert before query in tests
- Re-embedding triggered only on corpus version bump (policy version stored in metadata)

**Tests (per §7.11):**

- Unit: corpus chunking strategy (size + overlap); citation extraction from LLM response (cited clauseId must exist in corpus)
- Integration (Vitest + Miniflare): `embed-corpus.ts` populates Vectorize; matchPolicy step retrieves expected clauses for a known query
- Eval (smoke): 1 documentary case via `npm run eval` — assert policy_citations[] non-empty

---

### Phase 4 — Trust signal stack + unverifiable cases

**Goal:** Trust signal extraction across identity / track-record / geography / social / photo / story / vouching. Forced ESCALATE rule for unverifiable cases. 3 community-vouching cases route correctly.

**Force-read (internal — MUST read before implementing):**

- [ ] Phase 2 — workflow being extended, not rewritten
- [ ] Phase 1 — `signals` table already exists in schema; new columns may be needed via migration
- [ ] §7.11 Testing — every new signal extractor + forced-ESCALATE rule gets unit tests
- [ ] §12 Best-practices checklist — Vercel AI SDK section (structured output discipline)

**Force-read (external via context7 — MUST query before implementing):**

- [ ] context7 `/mastra-ai/mastra` — query: "adding workflow steps that read prior step outputs via context; conditional branching in workflows; .branch() or runtime context patterns"
- [ ] context7 `/vercel/ai` — query: "generateObject with discriminated-union zod schemas (enum + structured payload); structured output for enum classification tasks"
- [ ] Cloudflare docs (`cloudflare:cloudflare` skill, `references/d1`) — query: "drizzle-kit migrations on existing D1 schema; wrangler d1 migrations apply for schema changes mid-development"

**In scope:**

- Drizzle migration adding columns to `signals` table (if needed): `signal_type`, `payload_json` (already exists; verify shape)
- New Mastra workflow steps:
  - `photoSignal` — extracts EXIF presence/absence on uploaded photos; mocks reverse-image-search w/ realistic JSON shape; mocks AI-gen detection
  - `storyCoherence` — named-entity density + template-match against seeded corpus
  - `classifyVouchingChain` — discriminated-union zod schema: structure (none / individual-to-individual / individual-via-partner-org / org-direct) + partner_org_name + weakest_link_narrative
  - `computeVerificationPath` — deterministic predicate: DOCUMENTARY / INSTITUTIONAL_VOUCHING / COMMUNITY_VOUCHING / NONE
  - `forcedEscalateGate` — pure TypeScript predicate: `verification_path == NONE && geography_tier in (OFAC_ADJACENT, OFAC)` → forces recommendation to ESCALATE; otherwise passes through to `composeBrief`
- New step `draftOrganizerMessage` — generates the specific missing-evidence ask per LaunchGood policy
- 3 community-vouching seeded cases at `src/seeds/community-vouching/*.json`:
  - Yemen family relief (community-vouching, OFAC-adjacent)
  - Sudan masjid build with partner org (INSTITUTIONAL_VOUCHING)
  - Gaza individual emergency w/ no documentary path (NONE → forced ESCALATE)

**Out of scope:** Real reverse-image-search (mocked), AI-gen detection (mocked), KYC vendor (mocked), HITL (Phase 7), UI (Phase 6), queue (Phase 5), observability (Phase 8).

**Deliverable:** All 8 seeded cases (5 documentary + 3 community-vouching) produce structured briefs with trust signal stack populated. Unverifiable cases visibly route to ESCALATE.

**Acceptance criteria:**

- All 3 community-vouching cases route to ESCALATE
- Brief explicitly says "no documentary verification path; trust = vouching strength" when applicable
- Forced-ESCALATE rule unit-testable in isolation (no LLM dependency)
- Drafted-organizer-message text names specific missing items per policy

**Implementation notes:**

- `forcedEscalateGate` runs AFTER `composeBrief` if `composeBrief` proposed APPROVE — overrides it to ESCALATE. AI proposal + deterministic override = clean human/AI boundary signal in the demo video
- Mocked reverse-image-search returns shape: `{ hits: Array<{ url: string; confidence: number }>; checked_at: string }`
- Mocked AI-gen detection returns shape: `{ probability: enum, model: 'mock-v1' }` — clamp probability via post-parse helper
- `classifyVouchingChain` uses discriminated-union zod schema so the `partner_org_name` field is required only when structure is `individual-via-partner-org` or `org-direct`

**Tests (per §7.11):**

- Unit: `forcedEscalateGate` predicate (truth-table tests); `classifyVouchingChain` schema validation; drafted-message template name-matching
- Integration: workflow runs against 3 community-vouching cases; signals table populated end-to-end
- Eval (smoke): 1 community-vouching case via `npm run eval` — assert ESCALATE

---

### Phase 5 — Ingestion queue + Mode B background processing

**Goal:** New cases enqueued via producer endpoint; consumer Worker processes up to `max_concurrency=3` in parallel with idempotent redelivery handling.

**Force-read (internal — MUST read before implementing):**

- [ ] §7.5 Architecture detail — Mode B background path
- [ ] §7.8 Ingestion queue — full pattern with wrangler config + producer/consumer code
- [ ] §7.10 Idempotency — Layers 2 (producer guard) + 3 (consumer idempotency) ship in this phase; runId-pinning pattern
- [ ] §11 wrangler.jsonc shape — Queue producers + consumers config + DLQ

**Force-read (external via context7 — MUST query before implementing):**

- [ ] Cloudflare docs (`cloudflare:cloudflare` skill, `references/queues`) — query: "wrangler.jsonc producers + consumers + max_batch_size + max_concurrency + max_retries + dead_letter_queue + retry_delay; MessageBatch.messages msg.ack() + msg.retry()"
- [ ] context7 `/mastra-ai/mastra` — query: "workflow.createRun({runId}) — pinning runId for durable persistence; redelivery resumes from last persisted step"
- [ ] Cloudflare docs (`cloudflare:cloudflare` skill, `references/workers`) — query: "ExportedHandler with both fetch and queue exports; single Worker handles both HTTP and Queue consumer"

**In scope:**

- `wrangler.jsonc` Queue producer + consumer config (per §7.8); `max_batch_size: 1` (each brief is heavy); `max_concurrency: 3`; `max_retries: 3`; DLQ
- Producer endpoint `POST /api/cases/:id/brief` updated:
  - If `Accept: text/event-stream` → Mode A (Phase 2 path, unchanged)
  - If `Accept: application/json` → idempotency-guarded enqueue (per §7.10 Layer 2) → returns `{status: "QUEUED", run_id, replay: bool}`
- Consumer handler `src/queue-consumer.ts` exporting `handleBriefQueue(batch, env)`:
  - For each message: check run state in D1 → if RUNNING/COMPLETED → ack; else atomically claim → `workflow.createRun({runId}).start()` → on success ack, on failure retry
  - Per §7.10 Layer 3 — all paths idempotent; redelivery is safe
- Single Worker `src/index.ts` exports both `fetch` (Hono app) and `queue` (consumer handler)
- D1 case-row status transitions: DRAFT → QUEUED → RUNNING → READY_FOR_REVIEW / SUSPENDED_HITL

**Out of scope:** UI (Phase 6), HITL (Phase 7), resumability SSE catch-up (Phase 7), observability (Phase 8).

**Deliverable:** Enqueue 10 cases via `for i in {1..10}; do curl -X POST -H 'Accept: application/json' ... ; done` → consumer processes 3 concurrently, queue drains correctly.

**Acceptance criteria:**

- 3 cases process concurrently when `max_concurrency: 3`
- 4th case waits in queue until a slot frees
- Send same queue message twice → consumer ack's second without re-running the workflow
- Inducing a step failure 4× → message lands in DLQ
- Idempotency-guarded producer: same `POST` with active run → returns existing run state, does not double-enqueue

**Implementation notes:**

- `runId` generated at enqueue via `crypto.randomUUID()`; passed to consumer; passed to `workflow.createRun({runId})` — Mastra's durable persistence key
- Atomic D1 claim: drizzle update with status guard (`WHERE status IN ('QUEUED')`); returning rows >0 means claim succeeded
- DO NOT delete the message on failure — `msg.retry()` until max_retries, then DLQ catches
- Mode A streaming path remains the default UX; Mode B is for batch / background / disconnected scenarios

**Tests (per §7.11):**

- Unit: idempotency-guard predicate (active run detection); D1 claim query mocked
- Integration (Vitest + Miniflare): producer enqueues; consumer pulls; redelivery idempotent; DLQ catches max-retries-exceeded
- E2E: skipped this phase (no UI yet)

---

### Phase 6 — Reviewer UI (shadcn + TanStack Query + TanStack Router + Hono RPC + RHF) + Mode A streaming

**Goal:** `apps/web` ships: TanStack Router routes (`/login`, `/queue`, `/case/:caseId`), shadcn UI primitives, end-to-end-typed Hono RPC client, React Query owning all REST state, RHF for forms, `useChat` (AI SDK) for the Mode A streaming brief. Reviewer logs in, sees queue, opens case, brief streams live.

**Force-read (internal — MUST read before implementing):**

- [ ] Phase 1 — auth + session shape; `auth-client` from better-auth React lib
- [ ] Phase 2 — Mode A streaming endpoint contract
- [ ] §7 Stack decisions (Auth + UI subsection) — shadcn components + TanStack Query/Router + Hono RPC + RHF rows
- [ ] §7.5 Architecture detail — Mode A streaming end-to-end
- [ ] §7.7.5 Client state architecture — where every state kind lives; do NOT introduce Zustand
- [ ] §7.7.6 Considered & rejected — read the Zustand + Redis rejections before adding any state library
- [ ] §12 Best-practices checklist — better-auth (declarative role gating) + Vercel AI SDK (`useChat`) + TanStack Query + RHF subsections

**Force-read (external via context7 — MUST query before implementing):**

- [ ] context7 `/tanstack/query` — query: "QueryClient setup; QueryClientProvider; useQuery + useMutation hooks v5 API; queryKey conventions; staleTime + gcTime; invalidateQueries patterns; ReactQueryDevtools"
- [ ] context7 `/tanstack/router` — query: "createRootRoute + createRoute + RouterProvider; route loaders that integrate with TanStack Query; search-param API with zod validation; preloading"
- [ ] context7 `/websites/hono_dev` — query: "Hono RPC client hc<AppType>() setup; exporting AppType from worker for client import; typed responses + typed JSON bodies; query and param typing"
- [ ] context7 `/websites/hono_dev` — query: "@hono/zod-validator middleware for routes; validating json/query/param/header with shared zod schemas"
- [ ] shadcn/ui (https://ui.shadcn.com) — components needed: `data-table`, `card`, `tabs`, `badge`, `button`, `dialog`, `sheet`, `toast`, `form`, `skeleton`, `alert`. Install via `bunx shadcn@latest add <component>`. DO NOT hand-roll.
- [ ] context7 `/vercel/ai` — query: "useChat hook with DefaultChatTransport pointing at custom Hono SSE endpoint; consuming data-workflow + tool-\* + text parts; UI message renderer per part type"
- [ ] context7 `/mastra-ai/mastra` — query: "toAISdkStream({from: 'workflow', version: 'v6'}) part shapes (data-workflow, tool-{key}, data-{custom}); how part types map to UI rendering"
- [ ] React Hook Form + `@hookform/resolvers/zod` docs — query: "Form integration with shadcn Form component; zodResolver setup; shared zod schemas between client and server"

**In scope:**

_App shell (`apps/web/src/main.tsx`):_

- TanStack Router `<RouterProvider>` wrapping the app
- `<QueryClientProvider>` w/ a singleton `QueryClient` (default `staleTime: 30s`, `gcTime: 5min`, `retry: 1`)
- `<ReactQueryDevtools>` in dev only
- shadcn theme provider + `<Toaster>`

_Routes (TanStack Router file-based or code-based — pick one and commit):_

- `/login` — RHF + zod (email + password); on submit → better-auth client signin → invalidate `['session']` → router navigate to `/queue`
- `/queue` — route loader prefetches `['cases', filters]` via React Query → DataTable rendered from cached data; URL search params drive filter/sort/page
- `/case/:caseId` — route loader prefetches `['cases', caseId]` → renders case detail; if case status is RUNNING, mount `<BriefStream>` which uses `useChat` against `/api/cases/:caseId/brief`
- `/admin/audit` — admin-only loader checks role; React Query fetches paginated audit log

_Hono RPC client (`apps/web/src/lib/rpc.ts`):_

- `import type { AppType } from '@mizan/shared/app-type'` (worker re-exports its Hono `AppType` via `packages/shared`)
- `export const api = hc<AppType>('/api')` — one typed client, used by every React Query `queryFn` + every `useMutation`
- Wrapper adds `Idempotency-Key` header on mutations (UUID v4 generated client-side)

_Server validation (`apps/worker/src/routes/_`):\*

- Every Hono route uses `@hono/zod-validator`:
  ```ts
  app.post('/api/cases/:id/action',
    zValidator('json', ReviewerActionSchema), // from @mizan/shared
    async (c) => { ... }
  )
  ```
- Zod schemas defined ONCE in `@mizan/shared`; imported by RHF client + zValidator server + step contracts

_Forms (RHF + shadcn `<Form>`):_

- Login form: `LoginSchema` (zod) → `useForm({ resolver: zodResolver(LoginSchema) })`
- Reviewer action form: `ReviewerActionSchema` (action enum + rationale required on Override/Block + client-generated `action_id`)
- All forms use shadcn `<Form>` + `<FormField>` + `<FormMessage>` for accessibility + error display

_Brief streaming UI:_

- `<BriefStream caseId={...}>` component uses `useChat({ transport: new DefaultChatTransport({ api: \`/api/cases/${caseId}/brief\` }) })`
- Renders typed parts: `data-workflow` → step-by-step progress; `tool-*` → extraction cards; `text` → brief copy
- On stream completion → React Query `invalidateQueries({queryKey: ['cases', caseId]})` so case status reflects READY_FOR_REVIEW

**Out of scope:** HITL action capture (Phase 7), audit log full UI (Phase 7), workflow_events resumability (Phase 7), observability dashboard (Phase 8), eval UI (Phase 9).

**Deliverable:** Reviewer logs in, sees queue (DataTable with 8 seeded cases), opens any case (Sheet or full page), brief streams live via SSE to completion. All client state has a documented home per §7.7.5.

**Acceptance criteria:**

- All 8 seeded cases visible in the queue DataTable, fetched via React Query through Hono RPC client
- TypeScript: changing a Hono route's response shape causes a compile error in the React component consuming it (end-to-end typing verified)
- Filter/sort persisted in URL search params; refresh restores state
- Click a case → opens detail → brief streams live; stream completion invalidates the case query → status updates
- Login form rejects invalid email with inline error (RHF + zod) BEFORE hitting the server
- `bunx shadcn@latest add <component>` was used for every UI primitive; no hand-rolled equivalents
- Grep verified: zero `import { create } from 'zustand'`; zero direct `fetch(` calls outside `lib/rpc.ts`

**Implementation notes:**

- TanStack Query queryKey convention: `['cases']` for list, `['cases', caseId]` for detail, `['cases', caseId, 'events']` for the SSE event log (Phase 7), `['session']` for auth
- TanStack Router `beforeLoad: ({ context }) => requireSession(context)` gates protected routes; redirects to `/login` if no session
- Hono RPC: in worker, `const route = app.post(...).post(...)` — export `type AppType = typeof route` from the entry file; re-export through `@mizan/shared/app-type` so the client imports a stable path
- `useChat`'s `DefaultChatTransport({ api: \`/api/cases/${id}/brief\` })`—`caseId` is in URL, never body
- React Query `staleTime: 30_000` default; case-detail query uses `staleTime: 5_000` so it refetches on focus while a brief is running
- Mutations: `useMutation({ mutationFn: api.cases[':id'].action.$post, onSuccess: () => qc.invalidateQueries(...) })`
- shadcn `<DataTable>` uses TanStack Table internally — read its docs once for column defs + filtering

**Tests (per §7.11):**

- Unit: component-level (login form validates; queue row renders status badge correctly); React Query queryKey factory functions
- Integration: MSW (Mock Service Worker) mocks the Hono RPC endpoints; React Testing Library asserts useQuery → DataTable render
- Contract: snapshot the inferred `AppType` so client-server contract drift is detected
- E2E (Playwright): login → queue → open case → wait for stream → assert final brief rendered; assert URL search params persist through refresh

---

### Phase 7 — HITL suspend/resume + reviewer actions + resumability

**Goal:** Workflow suspends at reviewer-action gate; reviewer acts in the UI with rationale; workflow resumes. Refresh on a running case resumes progress without restart.

**Force-read (internal — MUST read before implementing):**

- [ ] §7.5 Architecture detail — Mode C HITL
- [ ] §7.9 Resumability — workflow_events table + SSE Last-Event-ID catch-up pattern
- [ ] §7.10 Idempotency — Layer 4 (reviewer action idempotency via client `action_id`)
- [ ] §7.11 Testing — HITL integration tests + Playwright refresh-resume scenario
- [ ] Phase 1 — workflow_events table already in schema
- [ ] Phase 6 — UI components reused for the action form

**Force-read (external via context7 — MUST query before implementing):**

- [ ] context7 `/mastra-ai/mastra` — query: "step.suspend({awaiting, payload}) + run.resume({resumeData}) durable on D1 storage adapter; how to detect suspended state and resume by runId"
- [ ] context7 `/vercel/ai` — query: "EventSource Last-Event-ID resume semantics; useChat behavior when SSE reconnects mid-stream"
- [ ] context7 `/mastra-ai/mastra` — query: "workflow event hooks; per-step lifecycle callbacks for writing to external event log"

**In scope:**

- New Mastra step `awaitReviewerAction` between `composeBrief` and finalization:
  - Calls `step.suspend({awaiting: 'reviewer_action', briefId, runId})`
  - Workflow state persists to D1
- Hono endpoint `POST /api/cases/:id/action`:
  - Accepts `{action: 'approve'|'request_docs'|'escalate'|'block'|'override', rationale, action_id}`
  - Idempotency by `action_id` (per §7.10 Layer 4)
  - Fetches suspended run by runId → `run.resume({resumeData: action})`
- New step `recordAction` after resume — writes to `reviewer_actions` table; rationale required on Override + Block (zod validation)
- New step `promoteToEval` — writes to eval-promotion ledger
- `workflow_events` table writes from each step's lifecycle (start / finish / suspend / resume)
- New endpoint `GET /api/cases/:id/stream`:
  - Reads `current_run_id` from D1
  - Catch-up: replays all `workflow_events` for that runId from `Last-Event-ID` header
  - Live tail: polls D1 every 500ms for new events (DO pubsub deferred to production)
- UI updates:
  - Case detail Sheet renders action buttons (Approve / Request Docs / Escalate / Block / Override) when workflow is SUSPENDED_HITL
  - Form for rationale (required on Override + Block); Toast on success
  - Audit log view at `/admin/audit` (admin-only)
  - SPA refresh on `/case/:caseId` while RUNNING → fetches case state → opens SSE w/ Last-Event-ID → progress replays then tails live

**Out of scope:** Observability (Phase 8), eval (Phase 9), polish (Phase 10), Durable Object pubsub.

**Deliverable:** Reviewer opens a case → workflow streams brief → workflow suspends at action gate → reviewer acts → workflow resumes → final state captured. Refresh during streaming resumes correctly.

**Acceptance criteria:**

- Workflow suspends at `awaitReviewerAction` step
- Suspended state persists to D1; visible via `GET /api/cases/:id` returning `status: 'SUSPENDED_HITL'`
- Reviewer action via UI resumes the run
- Rationale required on Override + Block (form validation)
- Refresh mid-stream: page reloads → SSE reconnects w/ Last-Event-ID → only events after Last-Event-ID stream → UI shows progress without restart
- Audit log shows complete decision trail per case (input + brief + action + rationale + timestamps + retrieved policy)

**Implementation notes:**

- `step.suspend()` payload is what the reviewer needs to act on (briefId + the brief itself); persisted with the suspended run state
- `run.resume({resumeData})` takes the reviewer action object; Mastra workflow continues from the suspension point
- Browser's `EventSource` auto-sends `Last-Event-ID` on reconnect — no client-side hack needed; server reads it from headers
- Polling D1 every 500ms is fine for demo; production switches to a Durable Object per runId for pubsub fanout
- `action_id` is a client-generated UUID v4 — duplicate POST with same `action_id` returns cached result (per §7.10 Layer 4)

**Tests (per §7.11):**

- Unit: action zod schema (rationale required on Override + Block); SSE event serialization (`id: <seq>\nevent: <type>\ndata: <json>\n\n`)
- Integration (Vitest + Miniflare): full HITL cycle (start → suspend → state in D1 → resume → final state); SSE Last-Event-ID catch-up against persisted events
- E2E (Playwright): HITL happy path; refresh-resume scenario; admin audit log access vs reviewer rejection

---

### Phase 8 — Observability (@mastra/observability + local Langfuse)

**Goal:** Every Mastra step + every LLM call shows in a local Langfuse trace tree with token + cost auto-extracted. No production dependency.

**Force-read (internal — MUST read before implementing):**

- [ ] §7.7 Langfuse local-only setup — Docker compose + LANGFUSE_HOST env var
- [ ] §12 Best-practices checklist — Vercel AI SDK telemetry section (experimental_telemetry shape, metadata fields, isEnabled conditional)
- [ ] Phase 2 — `experimental_telemetry` contract was set in Phase 2; this phase wires it up

**Force-read (external via context7 — MUST query before implementing):**

- [ ] context7 `/mastra-ai/mastra` — query: "@mastra/observability setup; Langfuse exporter; auto-traced spans vs manual instrumentation; token + cost extraction from traces"
- [ ] context7 `/langfuse/langfuse-docs` — query: "Self-hosted Docker compose setup for local dev; LangfuseExporter from langfuse-vercel; OpenTelemetry registerOTel pattern for Workers"
- [ ] context7 `/langfuse/langfuse-docs` — query: "trace tree filtering by session/user/tag/metadata; cost tracking per provider/model"

**In scope:**

- `docker/docker-compose.langfuse.yml` (Langfuse + Postgres, `name: mizan-langfuse`, containers named `mizan-langfuse` + `mizan-langfuse-db`) — already scaffolded in Phase 0, now started + connected
- Provider factory (`packages/mastra/src/models/factory.ts`) wires `langfuse-vercel` `LangfuseExporter` into `registerOTel` (called ONCE at Worker boot via `src/instrumentation.ts`); single injection point so every model produced via `getModel` is traceable
- `packages/mastra/src/observability/flush.ts` exports `flushLangfuse(ctx: ExecutionContext): void` that defers `langfuseSpanProcessor.forceFlush()` via `ctx.waitUntil(...)` — mandatory on Workers because the runtime exits before background flushes complete
- Root span pattern at every endpoint that triggers LLM-bearing work: `startObservation("brief.generate", { input, asType: "span" })` wraps the Mastra run; nested AI SDK calls inherit via OTel parent context (no manual trace-id plumbing)
- Tool-level observation: every Mastra tool with an LLM body opens its own `startObservation(toolName, { ..., asType: "tool" })` and ends with `usageDetails`; the trace tree renders `brief.generate → step → tool → llm-generation` automatically
- `experimental_telemetry` on EVERY AI SDK call per the Phase 2 contract — verified by a CI grep gate (`grep -rL "experimental_telemetry" packages/mastra/src/steps/` should return zero matches; every step file must contain the literal)
- `models.json` for Langfuse self-hosted to cover the Phase 0-resolved model list (`claude-haiku-4-5`, `claude-opus-4-7`, `gpt-4o`, `gpt-4o-mini`, `anthropic/claude-3.7-sonnet` via OpenRouter); checked into `docker/langfuse-models.json` and seeded into the Langfuse project on first run
- Local Langfuse instance accessible at `http://localhost:3001`; project + API keys pre-seeded for the demo via a one-shot init script (`scripts/seed-langfuse.ts`); credentials surface in `.dev.vars`

**Out of scope:** Production Langfuse, drift alerts, cost-regression dashboard (Phase 9 owns regression), eval harness (Phase 9), polish (Phase 10).

**Deliverable:** Local Langfuse dashboard renders trace tree for any brief generation — every step, every tool call, every LLM call visible w/ latency + tokens-in + tokens-out + cost USD. Demo video shows filtering by `sessionId`, `userId`, `tags`, and arbitrary metadata (`caseId`, `runId`).

**Acceptance criteria:**

- `docker compose -f docker/docker-compose.langfuse.yml up -d` brings Langfuse up at localhost:3001 with project pre-seeded
- Trigger a brief via wrangler dev → trace appears in dashboard within seconds (≤ 3s typical, ≤ 10s p95)
- Trace tree shows: `brief.generate` root span → workflow steps (`extract*`, `matchPolicy`, `composeBrief`, `awaitReviewerAction`, `recordAction`) → tool spans (`ocr.extract-id`, `reverseImageMock.lookup`, `registryLookup.query`, etc.) → LLM generations w/ token + cost
- Token + cost visible per generation; aggregate cost per brief computed by Langfuse (verified ±5% vs `@mizan/eval` cost ledger in Phase 9)
- Setting `LANGFUSE_HOST=""` (empty) → telemetry no-ops cleanly; zero overhead; no errors in worker logs
- Filtering: in Langfuse UI, filter by `tags=["mizan"]` and a specific `userId` reproduces only that reviewer's runs; filter by `metadata.caseId=<id>` returns exactly the runs for that case
- HITL continuity: a brief that suspends + resumes produces ONE trace (not two), verified by checking the trace tree contains both pre-suspend + post-resume spans under the same root

**Implementation notes:**

- Langfuse credentials (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`) live in `.dev.vars` (local only, never committed); in prod, set via `wrangler secret put`. Do NOT ship credentials in `wrangler.jsonc` `vars` — those are public.
- `registerOTel({ serviceName: "mizan", traceExporter: new LangfuseExporter({ sampleRate: 1.0, environment: env.ENVIRONMENT ?? "development" }) })` called ONCE at Worker boot from `apps/worker/src/instrumentation.ts`.
- `LANGFUSE_HOST` empty in CI → exporter's `isEnabled` short-circuits → zero overhead; CI tests verify this path by setting `LANGFUSE_HOST=""` and asserting trace tree call produces no network requests.
- Forward `c.executionCtx` from every Hono handler that opens a root span; `flushLangfuse(c.executionCtx)` runs the flush in `waitUntil` so the response isn't blocked. Verified in integration test by measuring response latency w/ + w/o Langfuse — delta < 5ms.
- Workers' execution-context `waitUntil` is the ONLY safe place to schedule the flush; `setTimeout` is blocked + `process.on("beforeExit")` doesn't exist on Workers.
- `models.json` shape: `[{ "model_name": "claude-opus-4-7", "input_price": 0.000015, "output_price": 0.000075, "unit": "TOKENS", "tokenizer_id": "claude" }, ...]`. Update on every provider price change (Phase 10 ops doc).

**Tests (per §7.11):**

- Unit: telemetry-config helper (returns correct shape based on `LANGFUSE_HOST` presence)
- Integration: trigger a brief → assert trace ID present in response headers (Langfuse exporter sets a trace ID); manual eyeballing of trace tree
- E2E (Playwright): Playwright opens `http://localhost:3001` → asserts a trace exists for the most recent caseId

---

### Phase 9 — Eval harness + provider-swap regression

**Goal:** Vitest eval spec runs gold set against the deployed workflow; provider-swap via env var stable across Anthropic/OpenAI/OpenRouter; cost regression tracked.

**Force-read (internal — MUST read before implementing):**

- [ ] §7.6 LLM Provider Factory — provider swap is env-var-only; no code edits between providers
- [ ] §7.11 Testing — full eval directory layout + gold-set shape + LLM-as-judge pattern + CI policy (no cron)
- [ ] Phase 8 — Langfuse traces are how cost is measured (auto-extracted from traces)
- [ ] §12 Best-practices checklist — Vercel AI SDK section (provider abstraction discipline)

**Force-read (external via context7 — MUST query before implementing):**

- [ ] context7 `/vercel/ai` — query: "Vitest patterns for testing generateObject calls w/ real LLM; deterministic seed values; cost tracking in tests"
- [ ] context7 `/mastra-ai/mastra` — query: "@mastra/observability cost extraction from traces; programmatic API to fetch trace data for assertions"
- [ ] Cloudflare docs (`cloudflare:cloudflare` skill, `references/miniflare`) — query: "Vitest + Miniflare integration via @cloudflare/vitest-pool-workers; running tests against real D1/R2/Vectorize bindings"

**In scope:**

- Gold set at `tests/eval/gold-set/`:
  - 10 reconstructed fixtures (historical cases mined from public criticism)
  - 5 curated edge cases (forced ESCALATE, near-miss APPROVE, ambiguous interpretive question)
  - 3 known-clean control cases (must pass with APPROVE)
- Fixture shape: `{ input, expected_recommendation, expected_missing_docs, expected_evidence_flags, expected_policy_citations? }`
- Vitest specs at `tests/eval/`:
  - `brief.eval.test.ts` — deterministic assertions on the 18 gold cases
  - `llm-judge.eval.test.ts` — LLM-as-judge spec for drafted-message specificity (judge with a DIFFERENT provider from the one under test)
  - `provider-swap.eval.test.ts` — runs gold set with each of 3 providers; asserts recommendation stability ≥95%
  - `cost-regression.test.ts` — tracks per-test-run average cost in JSON ledger; alerts on >20% delta
- `npm run eval` script (manual run, not in CI default)
- CI runs unit + integration + contract + e2e + a 3-case smoke-eval on push (per §7.11 CI policy)

**Out of scope:** Cron schedules, deploy gating, ML drift detection, production dashboards. This is a demo.

**Deliverable:** `npm run eval` runs locally; recommendation stability ≥95% across 3 providers; cost ledger tracks per-run cost.

**Acceptance criteria:**

- `npm run eval` passes on default provider (Anthropic)
- `DEFAULT_LLM_PROVIDER=openai npm run eval` passes; recommendation stability ≥95% vs Anthropic baseline
- `DEFAULT_LLM_PROVIDER=openrouter npm run eval` passes; recommendation stability ≥95%
- Average cost per brief from Langfuse traces is <$0.10
- Cost ledger JSON updated after each run; >20% delta logs a warning

**Implementation notes:**

- LLM-as-judge uses a DIFFERENT provider from the one under test (judge w/ OpenAI when testing Anthropic) to avoid same-model bias
- Provider-swap script is just `DEFAULT_LLM_PROVIDER=<x> npm run eval` — zero code edits
- Gold-set fixtures are JSON; recommendation comparison is deterministic; drafted-message comparison is LLM-judged
- Cost ledger at `tests/eval/.cost-ledger.json` — gitignored

**Tests (per §7.11):**

- Unit: gold-set fixture loader; LLM-as-judge rubric scoring; cost-ledger delta calculator
- Integration: not applicable (eval IS the test)
- Eval (full): 18 cases × 3 providers via `npm run eval` — manual, pre-recording

---

### Phase 10 — Polish + production deploy + submission

**Goal:** UI polish (loading / empty / error states), 5-min video recording, companion docs, **the only production `wrangler deploy` of the entire project**. Ship.

**This is the only phase where production deploy happens.** Phases 0–9 ran entirely against `wrangler dev` (Miniflare). Before deploying, every gate from `CLAUDE.md` non-negotiables MUST be green: `bun run lint && bun run knip && bun run typecheck && bun run test`.

**Force-read (internal — MUST read before implementing):**

- [ ] §3 Goal — skills the demo must visibly prove (use this as the video outline)
- [ ] §5 Success metrics — what the submission must show
- [ ] §9 Submission package — companion docs to write

**Force-read (external via context7 — MUST query before implementing):**

- [ ] shadcn/ui (https://ui.shadcn.com) — `skeleton`, `alert`, `empty-state` patterns for loading + error
- [ ] Cloudflare docs (`cloudflare:cloudflare` skill, `references/wrangler`) — query: "wrangler deploy + custom domains + secret bulk upload + observability dashboard"

**In scope:**

- UI polish: shadcn Skeleton for loading states; Alert for errors; empty-state cards for "no cases in queue"
- Toast feedback on every reviewer action
- Companion docs in repo:
  - `README.md`
  - `docs/why-mastra.md`
  - `docs/why-cloudflare.md`
  - `docs/provider-factory.md`
  - `docs/local-dev.md` (covers `wrangler dev` + Docker Langfuse + seeded users)
- `wrangler deploy` to `mizan.<slug>.workers.dev`
- Demo video recorded (Loom or local) ≤5min covering: problem framing, live brief streaming, HITL suspend/resume, Langfuse trace tree, eval spec run, provider swap demonstration
- Architecture diagram extracted from §7.5 + §7.8 Mermaid into a 1-page PDF

**Out of scope:** Any new feature, any production-only concern (DO pubsub, real reverse-image-search, real KYC).

**Deliverable:** Deployed URL + ≤5min video + repo with companion docs + 1-page architecture PDF.

**Acceptance criteria:**

- All four CI gates green: `bun run lint`, `bun run typecheck`, `bun run knip`, `bun run test`
- Grep belt-and-braces gate green: zero `as any` / `as unknown` / `// TODO` / `// FIXME` / `// HACK` / `// XXX` / `// @ts-nocheck` in non-test files
- `wrangler deploy` succeeds; Deployed URL accessible publicly
- Video covers all skill checkpoints in §3 within 5min
- Companion docs present and readable
- README has setup instructions that a stranger can follow

**Implementation notes:**

- Test the video opening (0:00-0:30) on a friend who doesn't know LaunchGood — must NOT land accusatorial
- Deploy w/ `wrangler deploy --env production`; secrets via `wrangler secret bulk .dev.vars`
- Architecture PDF: open the Mermaid in any renderer, export PNG → PDF

**Tests (per §7.11):**

- Run full test matrix one last time before deploy: unit + integration + contract + e2e + smoke-eval
- Manual smoke on the deployed URL: all 8 cases walkable
- Video re-watched in full; check audio, screen capture, no secrets visible

---

## 7. Stack decisions (Cloudflare-first, provider-agnostic, minimal external surface)

The entire stack lives on Cloudflare. One platform, one CLI (`wrangler`), one billing surface, one set of bindings. Provider-agnostic LLM access via factory pattern over AI SDK adapters.

### Runtime + Hosting + Compute

| Layer              | Choice                                    | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language           | TypeScript                                | LaunchGood is moving to Node/React; team can read and extend                                                                                                                                                                                                                                                                                                                                                               |
| Runtime            | **Cloudflare Workers (Paid plan, $5/mo)** | 5min CPU time per request, 10M requests/mo, Workflows + Queues included. The $5 plan is the right tier for any Mastra-on-Workers brief generation; free-tier 30s CPU is too tight.                                                                                                                                                                                                                                         |
| Backend framework  | **Hono**                                  | Workers-native; minimal overhead; first-class streaming via `c.body(stream)`; mounts Mastra via `@mastra/hono` adapter                                                                                                                                                                                                                                                                                                     |
| Background / async | **Cloudflare Queues**                     | Native producer + consumer-Worker model; `max_batch_size` + `max_concurrency` controls; at-least-once delivery; dead-letter queue. See §7.8 for the ingestion pattern.                                                                                                                                                                                                                                                     |
| Orchestration      | **Mastra**                                | TS-native; built-in eval primitives; first-class HITL via `.suspend()` / `.resume()`; official Cloudflare deployer + D1 storage adapter (`@mastra/cloudflare-d1`); Hono adapter (`@mastra/hono`); RAG primitives (`MDocument` + `ModelRouterEmbeddingModel`); observability via `@mastra/observability`. **When NOT to use:** single-shot prompts get no benefit from orchestration overhead — those go direct via AI SDK. |
| Repo layout        | **Bun workspaces monorepo**               | `apps/worker` (Cloudflare Worker) + `apps/web` (Vite + React + shadcn client) + `packages/db` + `packages/mastra` + `packages/shared` + `packages/eval`. Cross-workspace deps via `workspace:*`. Scripts orchestrated via `bun --filter '<pattern>' <script>`.                                                                                                                                                             |
| Package manager    | **Bun**                                   | `bun install` (lockfile is `bun.lock` text JSONC, committed; Bun 1.2+ default); `bun add <pkg>` per-workspace; `bun --filter` for cross-workspace orchestration. First-class workspace support, faster install + run than npm/pnpm. Supply-chain security stack (`bunfig.toml` + Socket scanner + `minimumReleaseAge` + `ignoreScripts` + `bun audit`) per §12 Bun workspaces.                                             |
| Lint               | **oxlint**                                | Rust-based linter (oxc-project); ~50–100× faster than ESLint. Root `.oxlintrc.json` with `typescript`/`import`/`unicorn`/`oxc`/`react` plugins; per-workspace overrides via `overrides[]`. Test files override `typescript/no-explicit-any: off`. Scaffolded via `oxlint --init`. CI: `bun run lint`.                                                                                                                      |
| Format             | **oxfmt**                                 | Rust-based formatter, oxlint's companion. npm package name is `oxfmt`. `bun run format`. Single command across monorepo. No Prettier.                                                                                                                                                                                                                                                                                      |
| Bundler/deploy CLI | `wrangler` (lives in `apps/worker`)       | `bun --filter @mizan/worker dev` / `... deploy`. One command for dev + deploy + secrets + bindings.                                                                                                                                                                                                                                                                                                                        |

### Data + Storage (all Cloudflare-native, zero external dependencies)

| Layer                    | Choice                                    | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relational DB            | **Cloudflare D1** (SQLite at the edge)    | Strong consistency; native Workers binding; drizzle adapter; `@mastra/cloudflare-d1` is the official Mastra storage adapter for workflow state, suspend/resume, memory                                                                                                                                                                                                                                                     |
| Object storage           | **Cloudflare R2**                         | S3-compatible; zero egress fees; ideal for organizer-uploaded ID + bank statement + category docs + photos; `better-auth-cloudflare` has first-class R2 file-storage integration with type/size validation                                                                                                                                                                                                                 |
| Vector store             | **Cloudflare Vectorize** (direct binding) | Mastra's RAG primitives produce embeddings via `ModelRouterEmbeddingModel`; embeddings persisted via Vectorize binding (`env.VECTORIZE.upsert` / `.query`) called from a Mastra step / tool. No Mastra-native Vectorize adapter required for the demo.                                                                                                                                                                     |
| Session/rate-limit cache | **Cloudflare KV**                         | Used by `better-auth-cloudflare` for sessions + rate limits (60s minimum TTL)                                                                                                                                                                                                                                                                                                                                              |
| ORM                      | **Drizzle (D1 adapter)**                  | `drizzle-orm/d1`; schema-merge with better-auth-generated tables via `@better-auth/cli generate`                                                                                                                                                                                                                                                                                                                           |
| Schema generation        | **`drizzle-zod`**                         | Generate zod schemas directly from drizzle table definitions: `createSelectSchema(cases)`, `createInsertSchema(cases, { ...refinements })`, `createUpdateSchema(cases)`. Single source of truth → ORM table is the canonical shape; RHF resolvers, `@hono/zod-validator`, Mastra step contracts, and shared TS types via `z.infer<...>` all derive from it. Schema drift between DB / API / UI / agent becomes impossible. |

### Auth + UI

| Layer                                    | Choice                                                                       | Reasoning                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth framework                           | **better-auth** + **`better-auth-cloudflare`** wrapper                       | `withCloudflare({d1, kv, r2}, betterAuthOpts)`; per-request init in Hono middleware; reviewer/admin roles; CLI schema generation (`npx @better-auth/cli generate`) merged with domain tables                                                                                                       |
| Per-request pattern                      | Hono middleware sets `c.var.auth = createAuth(c.env, c.req.raw.cf, baseURL)` | Documented pattern from `better-auth-cloudflare` examples                                                                                                                                                                                                                                          |
| UI components                            | **shadcn/ui** (Radix + Tailwind)                                             | Reviewer queue UI uses shadcn DataTable, Card, Tabs, Badge, Button, Dialog, Toast, Form; copy-paste components, no runtime dep, tailwind-driven                                                                                                                                                    |
| Client framework                         | **Vite + React** served as Workers static assets                             | One Worker hosts both API + SPA via `assets` binding                                                                                                                                                                                                                                               |
| Server state                             | **TanStack Query (React Query) v5**                                          | Owns all REST/fetch state: case list, case detail, audit log, settings. Cache + refetch + optimistic updates + stale-while-revalidate. Works hand-in-glove with TanStack Router loaders + Hono RPC client. `useChat` (AI SDK) owns ONLY the streaming brief state; everything else is React Query. |
| Client routing                           | **TanStack Router**                                                          | Type-safe routes, search-param API, route loaders that prefetch via React Query, integrates with React Query DevTools. Aligns with the strict-TS thesis.                                                                                                                                           |
| Client RPC                               | **Hono RPC client (`hc<AppType>()`)**                                        | End-to-end-typed fetch from React → Worker via Hono's built-in RPC client. No OpenAPI codegen, no hand-rolled fetch wrappers. Worker exports its `AppType`; client imports it from `@mizan/shared` re-export.                                                                                      |
| Server validation                        | **`@hono/zod-validator`**                                                    | Every Hono route validates query/json/form/headers against zod schemas from `@mizan/shared`. Same schemas the client uses for RHF + the worker uses for tool I/O. End-to-end zod.                                                                                                                  |
| Forms                                    | **React Hook Form + `@hookform/resolvers/zod`**                              | Wrapped by shadcn `<Form>`; same zod schemas as server validation. Reviewer action form, login form, override-rationale form.                                                                                                                                                                      |
| Spec emission _(optional, nice-to-have)_ | **`@hono/zod-openapi`**                                                      | Auto-generates OpenAPI from zod schemas; powers contract tests + future external integrations                                                                                                                                                                                                      |

### LLM + AI

| Layer            | Choice                                                                              | Reasoning                                                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM SDK          | **Vercel AI SDK** (provider-agnostic)                                               | `streamText` + `generateObject` work identically across providers; `toAISdkStream(stream, {from: 'workflow', version: 'v6'})` converts Mastra workflow streams to AI SDK UI message parts                                                                                                    |
| LLM providers    | **Anthropic + OpenAI + OpenRouter** via factory                                     | Single `getModel(provider, model)` returns `withMastra(providerImpl(model), {memory, processors})` — same code path for all providers; swap by env var or per-request override                                                                                                               |
| Vision/OCR       | Same provider via vision-capable model                                              | No separate OCR vendor (Claude vision or GPT-4o vision); minimize external APIs                                                                                                                                                                                                              |
| Embeddings       | `ModelRouterEmbeddingModel('openai/text-embedding-3-small')` or provider equivalent | Provider-agnostic via Mastra's model router                                                                                                                                                                                                                                                  |
| AI observability | **`@mastra/observability` → Langfuse self-hosted (local Docker, NOT deployed)**     | Mastra ships traces, logs, and auto-extracted metrics (token + cost) to Langfuse out of the box. Local Docker compose runs Langfuse + Postgres; Worker points `LANGFUSE_HOST` at `http://localhost:3001` in dev only. Demo video shows the trace tree per brief. Zero production dependency. |

### Eval + CI

| Layer       | Choice                              | Reasoning                                                                             |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| Eval runner | **Vitest + Miniflare/Wrangler dev** | Run eval against local Workers runtime with real D1/R2/Vectorize bindings (Miniflare) |
| CI          | **GitHub Actions**                  | `wrangler dev` headless + vitest; gates on the metrics in §5                          |

### Mocked-in-demo, replaced-in-production

| External system                  | Demo                               | Production                                                                                  |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Reverse image search             | Mocked w/ realistic JSON responses | TinEye API or Google Lens (~$0.001/check)                                                   |
| AI-gen image detection           | Mocked                             | Existing open detector or Hive                                                              |
| IRS Pub 78 / Charity Commission  | Mocked w/ seeded fake lookups      | Scheduled R2 sync of bulk file, queryable via D1                                            |
| Sanctions screening (400+ lists) | Mocked                             | LaunchGood's existing provider — reuse, don't replace                                       |
| KYC verification                 | Mocked                             | LaunchGood's existing vendor (likely Stripe Identity given Stripe Connect payments) — reuse |

**External-API count, demo:** 1–3 LLM providers (configured but only one active at a time). Everything else mocked or Cloudflare-native. This is genuinely minimal.

## 7.5 Architecture detail — streaming vs background

The same Mastra workflow runs in two modes depending on client connection state.

### Mode A — Client connected (interactive, default)

```
Browser
  │ fetch POST /api/cases/:id/brief (SSE)
  ▼
Hono on Workers
  │ creates Mastra workflow run
  │ run.stream({ inputData }) → AsyncIterable<workflow events>
  ▼
toAISdkStream(stream, { from: 'workflow', version: 'v6' })
  ▼
createUIMessageStream({ execute: write parts to writer })
  ▼
createUIMessageStreamResponse({ stream })
  ▼
Browser useChat() consumes typed parts: data-workflow, tool-*, text
```

Reviewer sees agent fan-out live (each extractor finishing, each policy match returning, final brief assembling). End-to-end target <8s.

### Mode B — Client disconnected / background

```
Hono on Workers
  │ enqueue { caseId, inputs } to Cloudflare Queue
  ▼
Queue consumer Worker
  │ creates Mastra workflow run
  │ run.start({ inputData }) → final result
  │ writes brief + signals to D1
  │ writes documents to R2
  ▼
Brief ready; D1 row updated to `STATUS = READY_FOR_REVIEW`
  ▼
Client returns later → fetch /api/cases/:id/brief returns cached brief
   (or subscribes to SSE of D1 change feed if implementing the live-refresh path)
```

Used when: reviewer kicked off a batch generate on the queue, or client tab closed mid-stream, or workflow exceeds Worker CPU budget mid-request.

### Mode C — HITL suspend/resume (the reviewer pause)

```
Workflow runs through extract → policy-match → brief-compose
  ▼
step.suspend({ awaiting: 'reviewer_action', briefId })
  ▼
Workflow persists state to D1 via @mastra/cloudflare-d1
  ▼
Reviewer opens queue UI; acts (approve/escalate/request-docs/block/override)
  ▼
Hono POST /api/cases/:id/action → fetch suspended run by briefId → run.resume({ resumeData: reviewerAction })
  ▼
Workflow finalizes: promotes to eval case, writes audit log, sends drafted message
```

Mastra workflows are durable-by-default on D1 storage — suspend/resume is first-class, not bolted on.

## 7.6 LLM Provider Factory (the agnostic core)

```typescript
// src/models/factory.ts
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { withMastra } from "@mastra/ai-sdk";
import type { LanguageModelV2 } from "@ai-sdk/provider";

type ProviderName = "anthropic" | "openai" | "openrouter";

interface ModelConfig {
  provider: ProviderName;
  model: string; // e.g. "claude-opus-4-7", "gpt-4o", "anthropic/claude-3.7-sonnet"
}

const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

export function getModel(
  { provider, model }: ModelConfig,
  opts?: WithMastraOptions,
): LanguageModelV2 {
  const raw =
    provider === "anthropic"
      ? anthropic(model)
      : provider === "openai"
        ? openai(model)
        : openrouter(model);

  return withMastra(raw, {
    memory: opts?.memory,
    processors: [langfuseTracingProcessor, ...(opts?.processors ?? [])],
  });
}
```

Every Mastra agent and every direct `generateObject` call uses `getModel(...)`. Provider switch = env var change. No code rewrite required.

Provider routing strategy in production:

- Default: Anthropic Claude (strong structured output + vision)
- Fallback on rate-limit or 5xx: OpenRouter (multi-provider abstraction; can route to Claude or GPT-4 transparently)
- Cost optimization: OpenAI for cheap deterministic extraction (smaller, faster models), Anthropic for the reasoning-heavy brief composition

## 7.7 Langfuse local-only setup

```yaml
# docker-compose.langfuse.yml (development-only; NOT shipped to Workers)
services:
  langfuse-db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
    volumes: [langfuse_db_data:/var/lib/postgresql/data]
  langfuse:
    image: langfuse/langfuse:latest
    depends_on: [langfuse-db]
    ports: ["3001:3000"]
    environment:
      DATABASE_URL: postgresql://postgres:postgres@langfuse-db:5432/postgres
      NEXTAUTH_SECRET: dev-secret
      SALT: dev-salt
      NEXTAUTH_URL: http://localhost:3001
      TELEMETRY_ENABLED: "false"
volumes: { langfuse_db_data: {} }
```

Instrumentation (Worker-side, registered once at boot):

```typescript
import { registerOTel } from "@vercel/otel";
import { LangfuseExporter } from "langfuse-vercel";

registerOTel({
  serviceName: "mizan",
  traceExporter: new LangfuseExporter({
    baseUrl: env.LANGFUSE_HOST, // http://localhost:3001 in dev; absent in prod
    environment: env.NODE_ENV,
  }),
});

// every AI SDK call:
await generateObject({
  model: getModel({ provider: "anthropic", model: "claude-opus-4-7" }),
  schema: BriefSchema,
  prompt,
  experimental_telemetry: {
    isEnabled: !!env.LANGFUSE_HOST,
    functionId: "compose-brief",
    metadata: { caseId, reviewerId, phase: "compose" },
  },
});
```

Demo video records the local Langfuse dashboard showing the trace tree for a brief generation: extract-id → extract-bank → extract-category-docs → policy-match → compose-brief, with per-step latency and token cost. This is how the candidate proves "evaluation framework + observability" without shipping a vendor dependency to production.

## 7.7.5 Client state architecture (where every kind of state lives)

State has a home. Picking the wrong home creates duplication and cache-coherence bugs. This is the canonical map.

| State kind                  | Owner                                               | Example                                                                                                                                                            |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server state (REST fetched) | **TanStack Query**                                  | `useQuery({queryKey: ['cases', filters], queryFn})` for queue list; `useQuery({queryKey: ['cases', id]})` for case detail; `useMutation` for reviewer action POSTs |
| Streaming brief state       | **`useChat` (AI SDK)**                              | The live SSE workflow stream + assistant message parts. React Query coordinates the "is this case running?" status query that decides whether to mount `useChat`   |
| URL / search-param state    | **TanStack Router**                                 | `/case/:caseId`, `/queue?status=ready&page=2`, `/audit?from=2026-05-01`. Route loaders prefetch via React Query                                                    |
| Form state                  | **React Hook Form** (via shadcn `<Form>`)           | Login form, reviewer action form (action + rationale + action_id), admin filter form                                                                               |
| Session / auth state        | **better-auth React client** wrapped in React Query | `useSession()` from better-auth client; React Query caches the session for the renderer; logout invalidates the query                                              |
| Ephemeral UI state          | **`useState` / `useReducer`**                       | Modal open/close, dropdown selection, hover, tooltips, transient toasts                                                                                            |
| Theme                       | **Context (shadcn theme provider)**                 | Light/dark/system; persisted to `localStorage`                                                                                                                     |
| Persistent user prefs       | **`localStorage` + React Query**                    | Default queue filter, column visibility on DataTable. React Query reads localStorage in `queryFn`; mutations write through                                         |

**The rule:** if you can answer "where does this state live" with one bullet above, ship it. If you reach for a global store because the above feels wrong, the state probably belongs in URL (TanStack Router) or in React Query's cache — those are the answers in 95% of cases.

## 7.7.6 Considered & rejected (with reasons)

Honest list of dependencies that look tempting but don't earn their slot in this stack.

| Tech                                   | Verdict             | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zustand**                            | Rejected            | No state shape needs a global cross-route store. Server state → React Query; URL → TanStack Router; forms → RHF; streaming → `useChat`; theme → context; transient → useState. Adding Zustand = adding a dependency + a new place to look when debugging state, for zero new capability. Revisit only if a genuine cross-route store emerges (multi-step wizard with backtracking, complex offline editing) — none today.                                         |
| **Redis (Upstash / hosted)**           | Rejected            | Every Redis-shaped need on this stack maps to a Cloudflare-native primitive. Idempotency cache + session cache + rate-limit windows → **KV**. Per-entity strongly-consistent state + pubsub fanout → **Durable Objects**. Message bus → **Cloudflare Queues**. Adding Redis = adding a hosted external service + Workers-to-Redis latency, for zero capability gain. KV's 60s minimum TTL is the only "limitation" and none of our use cases need sub-60s expiry. |
| **tRPC**                               | Rejected            | Hono's built-in RPC client (`hc<AppType>()`) gives the same end-to-end typed fetch with one less dependency. We already chose Hono; layering tRPC on top is ceremony.                                                                                                                                                                                                                                                                                             |
| **Effect-TS / fp-ts**                  | Rejected            | Powerful but over-engineering for an MVP. zod + structured AI SDK output already give us typed error handling at the seams that matter.                                                                                                                                                                                                                                                                                                                           |
| **Prisma**                             | Rejected            | Drizzle is the smaller, faster, Workers-friendly choice. Prisma's edge story is improving but Drizzle is already there.                                                                                                                                                                                                                                                                                                                                           |
| **GraphQL / Yoga**                     | Rejected            | REST + Hono RPC + zod is enough. Internal-tool surface, finite endpoints. GraphQL's killer features (over-fetch avoidance, federation) don't apply.                                                                                                                                                                                                                                                                                                               |
| **Cloudflare Workers AI**              | Rejected as primary | Provider-agnostic factory targets Anthropic + OpenAI + OpenRouter. Workers AI could be one more provider plugged into the factory if cost optimization demands it, but it's not the default — the goal is showing provider-agnostic substrate.                                                                                                                                                                                                                    |
| **Hyperdrive**                         | Rejected            | We use D1 (SQLite), not external Postgres/MySQL. Hyperdrive only matters if connecting to an external relational DB.                                                                                                                                                                                                                                                                                                                                              |
| **Cloudflare Workflows (the product)** | Rejected as primary | Mastra workflows persisted to D1 via `@mastra/cloudflare-d1` are our durable execution layer. Cloudflare Workflows is a separate product and would duplicate Mastra's durability model. Reserve it for the case where a single Mastra step exceeds Worker CPU budget — has not appeared in our brief shape.                                                                                                                                                       |
| **Sentry / Datadog**                   | Rejected for demo   | Cloudflare Observability (built-in) + local Langfuse cover the demo's needs. Production might add Sentry; not required to show the skill.                                                                                                                                                                                                                                                                                                                         |

## 7.8 Ingestion queue (the "as new cases arrive" question)

Cloudflare Queues is the right primitive for this. Hono producer endpoint accepts a new case → enqueues to `BRIEF_QUEUE` → consumer Worker (same code base, separate handler export) processes messages with controlled concurrency. New cases pile into the queue and process as workers free up — no manual orchestration required.

### Wrangler config (queue half)

```jsonc
{
  "queues": {
    "producers": [{ "binding": "BRIEF_QUEUE", "queue": "mizan-brief-jobs" }],
    "consumers": [
      {
        "queue": "mizan-brief-jobs",
        "max_batch_size": 5, // how many messages per consumer invocation
        "max_batch_timeout": 5, // seconds to wait to fill a batch
        "max_concurrency": 3, // how many consumer invocations run in parallel
        "max_retries": 3,
        "dead_letter_queue": "mizan-brief-jobs-dlq",
        "retry_delay": 30,
      },
    ],
  },
}
```

Knobs that answer "as new ones come, taken as current completes":

- `max_concurrency: 3` means up to 3 consumer Workers run in parallel — three briefs generate at once
- New messages arriving while all 3 are busy queue up; Cloudflare picks them up the moment any slot frees
- `max_batch_size: 5` means each consumer invocation can pull up to 5 messages at once (cheaper than one-at-a-time); for Mizan we likely want batch of 1 since each brief is a substantial Mastra workflow run, so `max_batch_size: 1` is the right call
- `max_retries: 3` + DLQ catches LLM failures; failed jobs move to DLQ for inspection

### Producer (Hono endpoint, runs in the request Worker)

```typescript
// src/routes/cases.ts
app.post("/api/cases/:id/brief", async (c) => {
  const caseId = c.req.param("id");
  const accept = c.req.header("Accept") ?? "";

  // Mode A — client connected, wants streaming
  if (accept.includes("text/event-stream")) {
    const mastra = c.get("mastra");
    const workflow = mastra.getWorkflow("brief");
    const run = workflow.createRun();
    const stream = await run.stream({ inputData: { caseId } });

    const uiStream = createUIMessageStream({
      execute: async ({ writer }) => {
        for await (const part of toAISdkStream(stream, { from: "workflow", version: "v6" })) {
          writer.write(part);
        }
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream });
  }

  // Mode B — client wants async; enqueue
  await c.env.BRIEF_QUEUE.send({
    caseId,
    enqueuedAt: Date.now(),
    requestedBy: c.var.session.userId,
  });
  return c.json({ status: "queued", caseId });
});
```

### Consumer (same Worker, separate export)

```typescript
// src/queue-consumer.ts
import type { MessageBatch } from "@cloudflare/workers-types";
import { mastra } from "./mastra";

export async function handleBriefQueue(
  batch: MessageBatch<{ caseId: string }>,
  env: CloudflareBindings,
) {
  for (const msg of batch.messages) {
    try {
      const workflow = mastra.getWorkflow("brief");
      const run = workflow.createRun();
      const result = await run.start({ inputData: { caseId: msg.body.caseId } });

      // Persist result; D1 row now reflects READY_FOR_REVIEW
      // (the workflow itself wrote signals + brief during execution via Mastra D1 storage)
      // Client polls /api/cases/:id or subscribes to a Durable Object change feed
      msg.ack();
    } catch (err) {
      console.error("brief workflow failed", msg.body.caseId, err);
      msg.retry(); // up to max_retries before DLQ
    }
  }
}

// src/index.ts (single Worker, both fetch and queue handlers exported)
export default {
  fetch: app.fetch, // Hono app
  queue: handleBriefQueue, // queue consumer
} satisfies ExportedHandler<CloudflareBindings>;
```

### Why this fits the user's question exactly

- New cases arrive via `POST /api/cases/:id/brief` (Mode B path) → enqueued
- Up to `max_concurrency` (3) briefs process simultaneously
- The moment one completes, the next waiting message starts — no manual orchestration
- Cloudflare handles back-pressure, retries, DLQ
- Reviewers see fresh briefs in the queue UI by polling `/api/cases?status=READY_FOR_REVIEW` (or via a Durable Object change feed for live updates — out of demo scope, mentioned as production extension only when explicitly asked)

### Mode A (streaming) vs Mode B (queue) selection

| Reviewer action                                                           | Mode                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Reviewer opens a specific case → wants live brief streaming               | Mode A — SSE through Mastra workflow `.stream()`                                                   |
| Admin triggers "regenerate all stale briefs" or "process backlog"         | Mode B — enqueue N messages, queue processes                                                       |
| Brief generation exceeds Worker CPU mid-request (rare, paid plan is 5min) | Fallback: Hono detects partial stream failure → enqueues remainder to queue → client returns later |

## 7.9 Resumability (refresh-and-see-progress)

**The case:** user starts a brief generation, browser disconnects, user refreshes the page — they must land back on the same case and see live progress, not start over.

This works because the **workflow run is durable on D1**, independent of the HTTP stream:

### State model (D1 schema, simplified)

```sql
CREATE TABLE cases (
  id TEXT PRIMARY KEY,                       -- stable case UUID; lives in the URL
  status TEXT NOT NULL,                      -- DRAFT | QUEUED | RUNNING | SUSPENDED_HITL | READY_FOR_REVIEW | ACTIONED
  current_run_id TEXT,                       -- Mastra workflow run id; null until a run starts
  brief_partial_json TEXT,                   -- live-updated as steps complete; full on READY_FOR_REVIEW
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE workflow_events (              -- one row per step transition
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,                      -- monotonic per run
  event_type TEXT NOT NULL,                  -- step.start | step.finish | step.suspend | step.resume | workflow.finish
  step_id TEXT,
  payload_json TEXT,
  emitted_at INTEGER NOT NULL,
  UNIQUE(run_id, seq)
);

CREATE INDEX idx_workflow_events_run ON workflow_events(run_id, seq);
```

Mastra steps are wired (via `@mastra/observability` hooks + a thin custom step wrapper) to write each `step.start` / `step.finish` event to `workflow_events` as they execute. The workflow itself is durable via `@mastra/cloudflare-d1`; the event log is a derived index for client replay.

### Client refresh flow

1. Browser hits `/case/:caseId`
2. Client renders shadcn skeleton + calls `GET /api/cases/:caseId` → returns `{status, current_run_id, brief_partial_json}` from D1
3. If `status in {QUEUED, RUNNING, SUSPENDED_HITL}`: client opens `GET /api/cases/:caseId/stream` (SSE), which:
   - Reads all `workflow_events` for `current_run_id` from D1 ordered by `seq` → replays them to the client (catch-up)
   - Then subscribes to new events as they're written (server polls D1 every 500ms OR uses a Durable Object as a pubsub fanout — DO is production-quality, polling is fine for demo)
4. Client renders steps progressively from replayed + live events
5. If `status == READY_FOR_REVIEW`: client renders final brief immediately; no SSE needed
6. If `status == SUSPENDED_HITL`: client renders partial brief + action buttons; reviewer action `POST /api/cases/:caseId/action` resumes the workflow run

### SSE endpoint (catch-up + live)

```typescript
app.get("/api/cases/:id/stream", async (c) => {
  const caseId = c.req.param("id");
  const caseRow = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!caseRow[0]?.current_run_id) return c.json({ error: "no active run" }, 404);

  const runId = caseRow[0].current_run_id;
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  const lastEventId = c.req.header("Last-Event-ID"); // SSE resume header
  const fromSeq = lastEventId ? parseInt(lastEventId, 10) : 0;

  const stream = new ReadableStream({
    async start(controller) {
      // 1) Catch-up: replay all persisted events past Last-Event-ID
      const past = await db
        .select()
        .from(workflow_events)
        .where(and(eq(workflow_events.run_id, runId), gt(workflow_events.seq, fromSeq)))
        .orderBy(workflow_events.seq);
      for (const ev of past) {
        controller.enqueue(`id: ${ev.seq}\nevent: ${ev.event_type}\ndata: ${ev.payload_json}\n\n`);
      }
      // 2) Live tail: poll D1 every 500ms for new events; production = Durable Object pubsub
      let cursor = past.at(-1)?.seq ?? fromSeq;
      const interval = setInterval(async () => {
        const next = await db
          .select()
          .from(workflow_events)
          .where(and(eq(workflow_events.run_id, runId), gt(workflow_events.seq, cursor)))
          .orderBy(workflow_events.seq);
        for (const ev of next) {
          controller.enqueue(
            `id: ${ev.seq}\nevent: ${ev.event_type}\ndata: ${ev.payload_json}\n\n`,
          );
          cursor = ev.seq;
          if (ev.event_type === "workflow.finish" || ev.event_type === "step.suspend") {
            clearInterval(interval);
            controller.close();
          }
        }
      }, 500);

      c.req.raw.signal.addEventListener("abort", () => clearInterval(interval));
    },
  });

  return new Response(stream, { headers });
});
```

The client `useChat` (or a raw `EventSource`) uses the SSE `Last-Event-ID` header on reconnect — browsers send it automatically. The server reads it and only ships events newer than the client has seen. Standard SSE semantics, no AI-SDK-specific hack required.

### Production-quality fanout

For a real deployment the polling-D1 tail becomes a Durable Object per `runId`:

- DO holds the latest event seq + a list of subscribed WebSocket clients
- Each `workflow_events.insert` notifies the DO via RPC
- DO broadcasts to subscribers
- New subscriber asks DO for "events since seq N" → DO reads from D1 + serves live
- O(1) latency per event, no polling

DO version is production-quality and explicitly out of demo scope. Mention in the video as the production extension; ship the polling version.

## 7.10 Idempotency (good practices applied throughout)

### Layer 1 — HTTP request idempotency

All state-mutating endpoints accept an `Idempotency-Key` header (RFC-spec UUID v4 from client). Hono middleware:

```typescript
app.use("/api/cases/*", async (c, next) => {
  if (c.req.method === "GET") return next();
  const key = c.req.header("Idempotency-Key");
  if (!key) return next();

  const cached = await c.env.KV.get(`idem:${key}`, "json");
  if (cached) {
    c.header("Idempotency-Replay", "true");
    return c.json(cached.body, cached.status);
  }
  await next();
  // After handler ran, store the response for replay
  // (uses a Hono response capture pattern; KV TTL 24h)
});
```

### Layer 2 — Producer idempotency (avoid duplicate workflow runs)

`POST /api/cases/:id/brief` checks `cases.current_run_id` before enqueueing. If a run is already RUNNING or QUEUED for that case, return the existing run state — never enqueue a second message for the same case:

```typescript
app.post("/api/cases/:id/brief", async (c) => {
  const caseId = c.req.param("id");
  const row = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (row[0]?.status === "QUEUED" || row[0]?.status === "RUNNING") {
    return c.json({ status: row[0].status, run_id: row[0].current_run_id, replay: true });
  }
  // Insert with optimistic concurrency: only progress if status was DRAFT/READY_FOR_REVIEW/ACTIONED
  const updated = await db
    .update(cases)
    .set({ status: "QUEUED", current_run_id: crypto.randomUUID(), updated_at: Date.now() })
    .where(
      and(eq(cases.id, caseId), inArray(cases.status, ["DRAFT", "READY_FOR_REVIEW", "ACTIONED"])),
    )
    .returning();
  if (updated.length === 0) return c.json({ error: "case is in a non-startable state" }, 409);

  await c.env.BRIEF_QUEUE.send({ caseId, runId: updated[0].current_run_id });
  return c.json({ status: "QUEUED", run_id: updated[0].current_run_id }, 202);
});
```

### Layer 3 — Queue consumer idempotency (at-least-once delivery means handle retries)

Queue messages can be redelivered. Consumer must be safe to retry:

```typescript
export async function handleBriefQueue(
  batch: MessageBatch<{ caseId: string; runId: string }>,
  env: CloudflareBindings,
) {
  for (const msg of batch.messages) {
    const { caseId, runId } = msg.body;
    // Idempotency guard: a workflow run with this runId already started?
    const existing = await checkRunIdempotency(env, runId);
    if (existing === "COMPLETED") {
      msg.ack();
      continue;
    } // already done; ack and move on
    if (existing === "RUNNING") {
      msg.ack();
      continue;
    } // another consumer picked it up; let that one finish
    // Otherwise claim it (atomic D1 update from QUEUED → RUNNING with runId guard)
    const claimed = await claimRun(env, caseId, runId);
    if (!claimed) {
      msg.ack();
      continue;
    } // lost the race; acknowledge

    try {
      const workflow = mastra.getWorkflow("brief");
      const run = workflow.createRun({ runId }); // pinned runId — Mastra uses it as the persistence key
      await run.start({ inputData: { caseId } });
      msg.ack();
    } catch (err) {
      console.error("brief failed", caseId, runId, err);
      msg.retry();
    }
  }
}
```

The `runId` is generated once at enqueue (`crypto.randomUUID()`); message redelivery uses the same `runId`; Mastra's D1 storage treats it as the durable key — re-`createRun({runId})` resumes from the last persisted step rather than restarting.

### Layer 4 — Reviewer action idempotency

`POST /api/cases/:id/action` includes a client-generated `action_id` (UUID v4). Server stores `(case_id, action_id)` with UNIQUE constraint. Duplicate action = returns cached result. Reviewer double-click never produces double-action.

### Layer 5 — File upload idempotency

R2 keys are deterministic: `{caseId}/{docType}/{contentHash}`. Re-uploading the same file = same key, same object, no duplication. Content hash computed client-side via `crypto.subtle.digest`.

### Layer 6 — Eval-case promotion idempotency

Reviewer actions promote to eval cases with key `(caseId, runId)`. Re-running the promoter is a no-op.

---

## 7.11 Testing (regression, unit, integration — non-negotiable)

The demo's eval is small but the test suite is comprehensive. Every layer of the stack is tested. CI runs all tests on push (no cron — just on PR / push).

### Unit tests (Vitest, no Workers runtime)

- **Zod schemas** — every doc-extraction schema rejects bad inputs and accepts good ones; numeric clamping helpers tested
- **LLM provider factory** — `getModel({provider, model})` returns correct provider implementation; env-var override path works
- **Pure helpers** — required-doc spec generator (`category × geography → spec`), policy clause matcher, confidence-tier classifier, ESCALATE force-rule
- **Mastra step pure logic** — every step that has non-LLM logic (deterministic gates, signal aggregation) tested in isolation with mocked tool calls
- **Drafted-message templates** — name the specific missing items per policy; assert against expected output strings
- **D1 query layer** — drizzle queries tested against in-memory SQLite (`better-sqlite3` for tests)

### Integration tests (Vitest + Miniflare — real Workers runtime, real bindings)

- **Mastra workflow end-to-end** — run the brief workflow against Miniflare with D1 + R2 + Vectorize bindings; mock the LLM provider with deterministic canned responses; assert the final brief shape
- **HITL suspend/resume** — start a workflow, suspend at HITL gate, persist to D1, simulate reviewer action, resume, assert final state
- **Queue producer + consumer** — enqueue a case via Hono producer; assert consumer pulls it; assert idempotency on redelivery (send the same message twice → consumer ack's the second without re-running)
- **Hono routes** — auth-gated endpoints reject unauthenticated requests; reviewer-only endpoints reject admin-only access; CORS headers correct
- **better-auth flow** — signup → signin → session lookup → session expiry → signout, all against Miniflare D1 + KV
- **SSE resumability** — open SSE stream, send Last-Event-ID, assert only newer events stream
- **Idempotency-Key replay** — POST twice with same key, assert second returns `Idempotency-Replay: true` header + identical body

### Regression / eval tests (Vitest spec running with real LLM, behind `npm run eval` only — not CI default)

- **Gold-set assertions** — 18 seeded cases (10 reconstructed historical fixtures + 5 curated edges + 3 known-clean controls); deterministic outcomes asserted (BLOCK / READY / missing-doc list)
- **LLM-as-judge for soft criteria** — drafted-message specificity scored by a second LLM call against a rubric; gate at threshold
- **Provider-swap stability** — same 18 cases run with `DEFAULT_LLM_PROVIDER=anthropic|openai|openrouter`; output shape stable across providers; allow brief content drift but recommendation stability ≥95%
- **Cost regression** — average tokens per brief tracked across runs; alert if >20% increase

### Contract tests (consumer-driven)

- **AI SDK UI message stream shape** — server-emitted parts conform to `data-workflow`, `tool-*`, `text` part types; consumer (`useChat`) parses correctly
- **OpenAPI-style spec for Hono routes** — `hono/swagger-ui` exposes contract; tests assert request/response schemas

### E2E tests (Playwright, against `wrangler dev` local URL)

- **Reviewer happy path** — login → queue → open case → wait for stream → approve → assert audit log entry
- **HITL flow** — login → open case mid-stream → workflow suspends → reviewer overrides → assert resume → assert final state
- **Refresh resumability** — start brief → close tab → reopen `/case/:id` → assert progress shown without restart

### Test directory layout

```
tests/
├── unit/                              # vitest, no Workers runtime
│   ├── schemas/
│   ├── factory.test.ts
│   ├── helpers/
│   └── steps/
├── integration/                       # vitest + miniflare
│   ├── workflow.test.ts
│   ├── hitl.test.ts
│   ├── queue.test.ts
│   ├── routes/
│   ├── auth.test.ts
│   ├── sse.test.ts
│   └── idempotency.test.ts
├── eval/                              # `npm run eval` — real LLM
│   ├── gold-set/                      # 18 seeded cases
│   ├── brief.eval.test.ts
│   ├── llm-judge.eval.test.ts
│   ├── provider-swap.eval.test.ts
│   └── cost-regression.test.ts
├── contract/
│   ├── ai-sdk-stream.test.ts
│   └── hono-routes.test.ts
└── e2e/                               # playwright
    ├── reviewer-happy-path.spec.ts
    ├── hitl-flow.spec.ts
    └── refresh-resume.spec.ts
```

### CI policy (no overkill)

- **On every push:** unit + integration + contract + e2e (smoke subset) → blocks merge if failing
- **On every PR:** above + a smaller `eval` smoke (3 cases, single provider) — blocks merge if regression
- **Manual / on-demand:** full `eval` (18 cases × 3 providers) — for confidence before recording the demo video, not on every commit
- **No scheduled crons.** No nightly eval. No drift detection. This is a demo.

## 8. Risks + mitigations

| Risk                                                                                            | Likelihood            | Impact                            | Mitigation                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | --------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker CPU budget (30s std / 5min paid) exceeded on a heavy brief                               | Low                   | High                              | Mode B background path uses Cloudflare Workflows / Queues with no per-request CPU ceiling. Mode A streaming responses complete in <8s on the 5 seeded cases. Per-case timeout fallback: enqueue to Queue and respond with "processing" status. |
| Vectorize cold start or quota throttling                                                        | Low                   | Medium                            | Pre-warm at deploy; policy corpus is small (LaunchGood Zakat policy + Safety policy ≈ 50 chunks). Embeddings generated once at deploy.                                                                                                         |
| D1 region locality (each binding pinned to a region)                                            | Low                   | Low                               | All demo traffic from one reviewer; latency irrelevant at this scale. Production move = monitor read latency by region.                                                                                                                        |
| Document extraction quality on seeded fake docs is unconvincing                                 | Medium                | High                              | Use realistic seed data (anonymized public examples, generated docs that look like real hospital bills/IDs). Test extractors first; scope down to 3-4 fields per doc type if quality is below 90%.                                             |
| LaunchGood reads framing as accusatorial despite reframe                                        | Medium                | High                              | Test 0:30 opening on a friend who doesn't know the context. Default opening = "reviewer cognitive load on mechanical work," NOT "the badge is broken."                                                                                         |
| "Mastra isn't on the JD's framework list" pattern-matches to "candidate doesn't know LangGraph" | Low-Medium            | Medium                            | Explicit `why-mastra.md` doc + 20-second video beat: TS-native, durable workflows on D1, suspend/resume HITL out of the box, Cloudflare deployer official. Skip orchestration only for single-shot prompts.                                    |
| Reviewer disagrees with AI brief 40%+ of the time → "the AI doesn't actually help"              | Low (on seeded cases) | N/A for demo; flag for production | Demo runs on seeded cases where AI's call is correct. Langfuse trace dashboard surfaces disagreement-rate per agent as the operational metric a future deployment would gate on.                                                               |
| Cost runs higher than $0.10/brief in production                                                 | Low                   | Medium                            | Deterministic pre-filter handles ~60% before LLM. Langfuse cost-per-trace + Vitest CI gate.                                                                                                                                                    |
| Recruiter doesn't watch past 2 minutes                                                          | High                  | High                              | First 2 minutes: problem statement (0:30), live demo of brief generation (1:30). Stack opinion + roadmap after demo, not before.                                                                                                               |
| Mocked external systems look like hand-waving                                                   | Medium                | Medium                            | Explicit "this would be replaced by X in production" callouts in the UI itself, not just the video. Show the mock response shape next to a real-provider URL.                                                                                  |
| Langfuse local Docker setup adds video-recording friction                                       | Low                   | Low                               | Pre-start Langfuse stack before recording; switch between Mizan + Langfuse tabs in the demo. Local-only is the point — production has no Langfuse dependency.                                                                                  |

## 9. Submission package

- Deployed URL (`mizan.<slug>.workers.dev`)
- ≤5min Loom walkthrough video
- 1-page architecture sketch (PDF — extracted from the Mermaid diagram in `outputs/launchgood-mizan-ideation.md`)
- Link to `why-mastra.md` and `why-cloudflare.md` for the stack-opinion question
- Optional: link to public GH repo if comfortable (JD says no code submission but offering it shows confidence)

**Companion docs in the repo:**

- `docs/why-mastra.md` — "TS-native, durable workflows on D1, native suspend/resume HITL, official Cloudflare deployer. When NOT to use: single-shot prompts."
- `docs/why-cloudflare.md` — "One platform, one CLI, one billing surface. D1 + R2 + Vectorize + Workflows + Queues + Workers cover every dependency. Zero external infra except LLM providers."
- `docs/provider-factory.md` — the agnostic LLM thesis with code samples
- `docs/local-dev.md` — how to run Mizan locally w/ wrangler dev + Langfuse Docker

## 10. Concrete file layout (Bun workspaces monorepo)

```
mizan/
├── .gitignore                          # CLAUDE.md, AGENTS.md, docs/* (except prd.md + solutions/), bun cache, .dev.vars, bun.lockb defensively
├── .oxlintrc.json                      # root oxlint config (typescript/import/unicorn/oxc/react plugins + overrides for tests)
├── .oxfmt.json                         # oxfmt config (optional, defaults are sensible)
├── bunfig.toml                         # supply-chain security stack: scanner, minimumReleaseAge=14d, ignoreScripts, exact, saveTextLockfile, registry lock
├── bun.lock                            # COMMITTED — text JSONC lockfile (Bun 1.2+ default; bun.lockb binary format is deprecated and MUST NOT be committed)
├── lefthook.yml                        # pre-commit (lint/typecheck/knip/audit/grep) + pre-push (test)
├── renovate.json                       # 14-day bake period, exact-pin range strategy, vulnerability bypass
├── package.json                        # root: { "private": true, "packageManager": "bun@<exact>", "engines.bun": ">=1.3.11", "workspaces": ["apps/*", "packages/*"], "trustedDependencies": [], scripts: dev/build/test/lint/format/typecheck/audit/knip/eval }
├── tsconfig.base.json                  # extended by every workspace tsconfig.json
├── README.md
├── .env.example
├── .dev.vars.example                   # template for Wrangler local secrets
├── docker/
│   └── docker-compose.langfuse.yml     # local-only observability stack (NOT deployed)
├── docs/
│   ├── prd.md                          # this doc — TRACKED
│   ├── ideation.md                     # historical context — gitignored
│   └── solutions/                      # compounding learnings — TRACKED
│       └── ...
├── scripts/
│   ├── seed-users.ts                   # reviewer + admin seed
│   └── embed-corpus.ts                 # one-time policy embedding into Vectorize
├── apps/
│   ├── worker/                         # @mizan/worker — Cloudflare Worker (Hono + Mastra + queue consumer)
│   │   ├── package.json                # deps: hono, mastra, @mastra/*, ai, @ai-sdk/*, better-auth, @mizan/db, @mizan/mastra, @mizan/shared
│   │   ├── tsconfig.json               # extends ../../tsconfig.base.json
│   │   ├── wrangler.jsonc              # bindings: DB (D1), R2_BUCKET, VECTORIZE, KV, BRIEF_QUEUE; assets binding → ../web/dist
│   │   ├── src/
│   │   │   ├── index.ts                # Hono app + queue consumer; exports default { fetch, queue }
│   │   │   ├── env.ts                  # CloudflareBindings type
│   │   │   ├── auth/index.ts           # createAuth(env, cf, baseURL) via better-auth-cloudflare
│   │   │   ├── middleware/
│   │   │   │   ├── requireRole.ts      # declarative role-gate factory
│   │   │   │   └── idempotencyKey.ts   # §7.10 Layer 1
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts             # /api/auth/* mounted via better-auth handler
│   │   │   │   ├── cases.ts            # /api/cases + /:id/brief streaming (Mode A) + enqueue (Mode B)
│   │   │   │   ├── stream.ts           # /api/cases/:id/stream SSE catch-up + live tail (§7.9)
│   │   │   │   ├── actions.ts          # /api/cases/:id/action — HITL resume entry point
│   │   │   │   └── admin.ts            # admin-only audit log endpoints
│   │   │   └── queue-consumer.ts       # handleBriefQueue export for Cloudflare Queues
│   │   └── tests/
│   │       ├── unit/
│   │       └── integration/            # Vitest + Miniflare; real D1/R2/Vectorize/Queue/KV bindings
│   └── web/                            # @mizan/web — Vite + React + shadcn + TanStack Query/Router + Hono RPC
│       ├── package.json                # deps: react, react-dom, vite, @tanstack/react-query, @tanstack/react-query-devtools,
│       │                               #       @tanstack/react-router, hono (for hc client), ai (useChat),
│       │                               #       react-hook-form, @hookform/resolvers, zod, tailwindcss,
│       │                               #       better-auth (client export), @mizan/shared
│       ├── tsconfig.json
│       ├── vite.config.ts              # @tanstack/router-vite-plugin + @tailwindcss/vite (Tailwind 4 — no PostCSS, no tailwind.config.ts)
│       ├── components.json             # shadcn config (generated by `bunx shadcn init`)
│       ├── index.html
│       └── src/
│           ├── index.css               # Tailwind 4 entry: `@import "tailwindcss"` + `@theme` token block (CSS-first config — no tailwind.config.ts)
│           ├── main.tsx                # <QueryClientProvider> + <RouterProvider> + theme + <Toaster>
│           ├── routes/                 # TanStack Router file-based routes
│           │   ├── __root.tsx          # layout shell + Sidebar/Topbar
│           │   ├── login.tsx           # RHF + zodResolver(LoginSchema)
│           │   ├── queue.tsx           # loader: ensureQueryData(casesQuery); DataTable
│           │   ├── case.$caseId.tsx    # loader: ensureQueryData(caseQuery(caseId)); mounts <BriefStream/>
│           │   └── admin.audit.tsx     # beforeLoad: requireRole('admin'); paginated audit log
│           ├── components/
│           │   ├── ui/                 # shadcn primitives (bunx shadcn add)
│           │   ├── BriefStream.tsx     # useChat against /api/cases/:id/brief
│           │   ├── BriefPart.tsx       # typed renderer per AI SDK part type
│           │   ├── ActionForm.tsx      # RHF + ReviewerActionSchema; idempotency-key gen
│           │   └── QueueDataTable.tsx  # shadcn DataTable wrapping TanStack Table
│           └── lib/
│               ├── rpc.ts              # export const api = hc<AppType>('/api', { headers: ... })
│               ├── query-keys.ts       # central queryKey factory: cases(), case(id), session(), audit()
│               ├── queries.ts          # query functions wrapping api.* calls; reusable in loaders + useQuery
│               ├── auth-client.ts      # better-auth React client; useSession wrapped in React Query
│               └── idempotency.ts      # UUID v4 generator + fetch interceptor adding Idempotency-Key
├── packages/
│   ├── db/                             # @mizan/db — drizzle schema + migrations + generated zod schemas
│   │   ├── package.json                # deps: drizzle-orm, drizzle-kit, drizzle-zod, @better-auth/cli, zod
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts           # points at D1 binding via wrangler.jsonc
│   │   ├── src/
│   │   │   ├── index.ts                # exports merged schema + db client factory
│   │   │   ├── schema.ts               # domain: cases, briefs, signals, reviewer_actions, workflow_events
│   │   │   ├── auth.schema.ts          # generated by @better-auth/cli (user, session, account, etc.)
│   │   │   └── zod.ts                  # createSelectSchema/createInsertSchema/createUpdateSchema per table
│   │   │                               # + refinement overrides (email, enum narrowing, post-parse clamps)
│   │   │                               # + inferred TS types via z.infer<>
│   │   └── migrations/                 # drizzle-kit output; applied via `wrangler d1 migrations apply`
│   ├── mastra/                         # @mizan/mastra — Mastra workflows, steps, tools, provider factory, corpus
│   │   ├── package.json                # deps: mastra, @mastra/cloudflare-d1, @mastra/observability, ai, @ai-sdk/*, zod, @mizan/db, @mizan/shared
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                # Mastra instance factory: takes env, returns Mastra w/ D1Store({binding: env.DB})
│   │       ├── models/
│   │       │   └── factory.ts          # getModel({provider, model}) → withMastra(providerImpl(model), opts)
│   │       ├── workflows/
│   │       │   └── brief.workflow.ts   # createWorkflow w/ .then() steps + .suspend()/.resume() at HITL gate
│   │       ├── steps/
│   │       │   ├── classifyCampaign.ts
│   │       │   ├── extractCreatorIdDoc.ts
│   │       │   ├── extractBankStatement.ts
│   │       │   ├── extractCategoryDocs.ts
│   │       │   ├── extractStoryClaims.ts
│   │       │   ├── photoSignal.ts
│   │       │   ├── storyCoherence.ts
│   │       │   ├── classifyVouchingChain.ts
│   │       │   ├── computeVerificationPath.ts
│   │       │   ├── matchPolicy.ts      # Vectorize binding query
│   │       │   ├── composeBrief.ts
│   │       │   ├── forcedEscalateGate.ts
│   │       │   ├── awaitReviewerAction.ts   # the .suspend()
│   │       │   ├── draftOrganizerMessage.ts
│   │       │   ├── recordAction.ts
│   │       │   └── promoteToEval.ts
│   │       ├── tools/                  # zod-typed tools called inside steps
│   │       │   ├── ocrId.ts
│   │       │   ├── reverseImageMock.ts
│   │       │   ├── registryLookupMock.ts
│   │       │   └── sanctionsScreeningMock.ts
│   │       └── corpus/
│   │           ├── zakat-policy.json   # chunked from launchgood.com/zakatpolicy
│   │           └── safety-policy.json  # chunked from launchgood.com/safety
│   ├── shared/                         # @mizan/shared — re-exports from db + worker + extra cross-cutting schemas
│   │   ├── package.json                # deps: zod, @mizan/db (re-exports drizzle-zod schemas)
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                # barrel: re-exports @mizan/db zod schemas + app-type + non-DB schemas
│   │       ├── app-type.ts             # re-export of Hono AppType from worker (consumed by apps/web rpc client)
│   │       ├── schemas/                # ONLY schemas that don't map to a DB table: ReviewerActionSchema (action enum +
│   │       │                           # rationale + action_id), BriefStreamPart, drafted-message templates
│   │       └── types/                  # cross-cutting TS types not derivable from DB
│   └── eval/                           # @mizan/eval — gold set + eval runner utilities
│       ├── package.json                # deps: vitest, @mizan/mastra, @mizan/shared
│       ├── tsconfig.json
│       └── src/
│           ├── runner.ts               # provider-swap test orchestrator
│           ├── llm-judge.ts            # LLM-as-judge utilities
│           ├── cost-ledger.ts          # tracks per-test-run avg cost; alerts on >20% delta
│           └── gold-set/
│               ├── documentary/*.json
│               ├── community-vouching/*.json
│               └── controls/*.json
└── .github/
    └── workflows/
        ├── ci.yml                      # bun install → bun run lint → bun run typecheck → bun run test (unit + integration + smoke-eval)
        └── deploy.yml                  # manual / tag-based wrangler deploy
```

**Root `package.json` (canonical):**

```jsonc
{
  "name": "mizan",
  "version": "0.0.0",
  "private": true,
  "packageManager": "bun@1.3.11",
  "engines": { "bun": ">=1.3.11" },
  "workspaces": {
    "packages": ["apps/*", "packages/*"],
    "catalog": {
      "ai": "<latest-pinned>",
      "zod": "<latest-pinned>",
      "@ai-sdk/anthropic": "<latest-pinned>",
      "@ai-sdk/openai": "<latest-pinned>",
      "@ai-sdk/provider": "<latest-pinned>",
      "@openrouter/ai-sdk-provider": "<latest-pinned>",
      "@cloudflare/workers-types": "<latest-pinned>",
    },
  },
  "trustedDependencies": [],
  "scripts": {
    "dev": "bun --filter '*' dev",
    "build": "bun --filter '*' build",
    "test": "bun --filter '*' test",
    "lint": "oxlint",
    "format": "oxfmt --write .",
    "format:check": "oxfmt --check .",
    "typecheck": "bun --filter '*' typecheck",
    "audit": "bun audit --audit-level=high",
    "audit:prod": "bun audit --audit-level=high --prod",
    "knip": "knip",
    "eval": "bun --filter @mizan/eval eval",
    "deploy": "bun --filter @mizan/worker deploy",
    "db:generate": "bun --filter @mizan/db generate",
    "db:migrate:local": "bun --filter @mizan/worker exec wrangler d1 migrations apply DATABASE --local",
    "db:migrate:prod": "bun --filter @mizan/worker exec wrangler d1 migrations apply DATABASE --remote",
    "auth:generate": "bun --filter @mizan/db exec @better-auth/cli generate --config ../../apps/worker/src/auth/index.ts --output src/auth.schema.ts -y",
  },
}
```

**Root `bunfig.toml` (canonical — supply-chain security stack):**

```toml
[install]
exact = true
saveTextLockfile = true
minimumReleaseAge = 1209600
minimumReleaseAgeExcludes = ["typescript", "@types/node", "@cloudflare/workers-types", "wrangler"]
ignoreScripts = true
registry = "https://registry.npmjs.org"

[install.security]
scanner = "@socketsecurity/bun-security-scanner"
```

Note: `@socketsecurity/bun-security-scanner` is itself listed in `minimumReleaseAgeExcludes` so threat-intel updates can ship faster than the project-wide 14-day bake. Every other package is bake-gated.

**Root `lefthook.yml` (canonical):**

```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      run: bun run lint
    typecheck:
      run: bun run typecheck
    knip:
      run: bun run knip
    audit:
      run: bun audit --audit-level=high --prod
    forbidden-patterns:
      run: |
        ! git diff --cached --name-only -z | xargs -0 grep -lE '(^|[^/])as any\b|as unknown\b|: any\b|// (TODO|FIXME|HACK|XXX)|// @ts-nocheck' --exclude='*.test.ts' --exclude-dir=tests
pre-push:
  commands:
    test:
      run: bun --filter '*' test
```

**Root `renovate.json` (canonical):**

```jsonc
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "minimumReleaseAge": "14 days",
  "internalChecksFilter": "strict",
  "rangeStrategy": "pin",
  "schedule": ["after 9am on monday"],
  "vulnerabilityAlerts": {
    "minimumReleaseAge": "0 days",
    "schedule": ["at any time"],
  },
}
```

**Root `.oxlintrc.json` (canonical):**

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "import", "unicorn", "oxc", "react"],
  "env": { "browser": true, "node": true, "worker": true },
  "rules": {
    "eqeqeq": "error",
    "import/no-cycle": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-unsafe-assignment": "warn",
    "oxc/no-async-await": "off",
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.test.tsx", "**/tests/**/*.ts"],
      "rules": {
        "typescript/no-explicit-any": "off",
        "typescript/no-unsafe-assignment": "off",
      },
    },
    {
      "files": ["apps/web/**/*"],
      "env": { "browser": true, "node": false, "worker": false },
    },
    {
      "files": ["apps/worker/**/*", "packages/mastra/**/*"],
      "env": { "browser": false, "node": false, "worker": true },
    },
  ],
}
```

## 11. wrangler.jsonc shape (lives at `apps/worker/wrangler.jsonc`)

```jsonc
{
  "name": "mizan",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-19",
  "compatibility_flags": ["nodejs_compat", "nodejs_compat_populate_process_env"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mizan",
      "database_id": "<uuid>",
      "migrations_dir": "../../packages/db/migrations",
    },
  ],
  "r2_buckets": [{ "binding": "R2_BUCKET", "bucket_name": "mizan-uploads" }],
  "vectorize": [{ "binding": "VECTORIZE", "index_name": "mizan-policy-corpus" }],
  "kv_namespaces": [{ "binding": "KV", "id": "<uuid>" }],
  "queues": {
    "producers": [{ "binding": "BRIEF_QUEUE", "queue": "mizan-brief-jobs" }],
    "consumers": [
      {
        "queue": "mizan-brief-jobs",
        "max_batch_size": 1,
        "max_batch_timeout": 5,
        "max_concurrency": 3,
        "max_retries": 3,
        "dead_letter_queue": "mizan-brief-jobs-dlq",
        "retry_delay": 30,
      },
    ],
  },
  "assets": {
    "binding": "ASSETS",
    "directory": "../web/dist",
    "not_found_handling": "single-page-application",
  },
  "vars": {
    "DEFAULT_LLM_PROVIDER": "anthropic",
    "DEFAULT_LLM_MODEL": "claude-opus-4-7",
    "LANGFUSE_HOST": "",
  },
  "observability": { "enabled": true },
}
```

**Run commands (from repo root, via bun --filter):**

- `bun --filter @mizan/worker dev` — `wrangler dev` (boots Worker + Miniflare bindings locally; serves apps/web/dist as static assets if built)
- `bun --filter @mizan/web dev` — `vite` (boots SPA on `localhost:5173` for hot-reload front-end work)
- `bun --filter @mizan/worker deploy` — `wrangler deploy`
- `bun --filter @mizan/web build` then `bun --filter @mizan/worker deploy` for production (Worker serves the built SPA via the `ASSETS` binding)

**Secrets via `wrangler secret put` (run from `apps/worker/`):**
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `BETTER_AUTH_SECRET`. Local dev uses `apps/worker/.dev.vars` (gitignored).

## 12. Best-practices checklist (Vercel AI SDK · better-auth · Cloudflare · Bun · oxlint · drizzle · TanStack · RHF · Hono · knip)

This is the bar. Every item is enforced in code or surfaced in the demo video. **All seven non-negotiable coding principles from `~/Documents/Projects/personal/CLAUDE.md` apply on top of every subsection here:** file ≤400 LOC, function ≤50 LOC, clean + modular, no `any` / no `as` / no leaked `unknown`, no inline comments (only JSDoc), no dead code (knip), no band-aids. CI gate: `bun run lint && bun run knip && bun run typecheck && bun run test` — all four green or no merge.

### Drizzle + drizzle-zod (single source of truth)

- **Drizzle table = canonical shape.** Define columns, types, constraints once in `packages/db/src/schema.ts`. Everything downstream (zod, types, validators, RHF resolvers) derives from it.
- **`createSelectSchema` for reads.** Use when the API returns DB rows. `z.infer<typeof selectCasesSchema>` gives the TS type for a `Case`.
- **`createInsertSchema` for writes.** Generates the insert shape (id/timestamps optional). Pass refinements to tighten: `createInsertSchema(users, { email: z.string().email() })`.
- **`createUpdateSchema` for partial updates.** PATCH endpoints validate against this.
- **Never hand-write a zod schema that duplicates a table.** If you find yourself writing `z.object({ id, status, ... })` and the table already has those columns, you've drifted. Generate.
- **Refinements compose, not replace.** When the DB column is `text("email")` but the API requires email format, override at schema-generation time, not at validation time. Refinement lives next to the table definition.
- **Cross-table schemas live elsewhere.** `ReviewerActionSchema` (action enum + rationale + action_id) doesn't map to a single DB table — it lives in `@mizan/shared/schemas/`. Multi-table response shapes (e.g., case-with-brief-and-signals) compose via `selectCasesSchema.extend({ brief: selectBriefsSchema, signals: z.array(selectSignalsSchema) })`.
- **Types via `z.infer<>`, never re-declared.** `export type Case = z.infer<typeof selectCasesSchema>`. Never `interface Case { ... }` if a zod schema exists.
- **`@hono/zod-validator` consumes drizzle-zod output directly.** `zValidator('json', createInsertSchema(cases))` — no intermediate hand-written schema.
- **RHF resolver consumes drizzle-zod output directly.** `zodResolver(createInsertSchema(reviewer_actions, { ... }))` — same schema the server validates against.
- **Mastra step input/output schemas consume drizzle-zod output where applicable.** A step that writes to `signals` validates input via `createInsertSchema(signals)` and returns output via `createSelectSchema(signals)`.

### TanStack Query (v5)

- **One `QueryClient` per app, singleton.** Never re-instantiate inside React tree
- **queryKey is a contract.** Document the queryKey factory in one place (`apps/web/src/lib/query-keys.ts`); never inline-construct keys at call sites
- **`staleTime` is the cost control.** Default 30s; tighten where data must be fresh (case-detail while running); loosen where it's static (audit log)
- **Invalidate on mutation success, not optimistic.** Optimistic updates are tempting — but for review actions where the workflow resumes server-side, invalidate after the server confirms. Avoid optimistic on anything that triggers a workflow
- **`enabled`-gate dependent queries.** `useQuery({ enabled: !!caseId })` — don't fetch with a null ID, don't manually `if (caseId)` around the hook
- **Hydrate React Query from TanStack Router loaders.** Loaders call `queryClient.ensureQueryData(...)` so route preloads warm the cache; the component then `useQuery(...)` and gets instant data
- **DevTools in dev only.** `<ReactQueryDevtools initialIsOpen={false} />` wrapped in `import.meta.env.DEV`
- **No global ambient queries.** Every fetch is a named query with explicit key and queryFn. No "magic auto-fetch on mount" via effects

### React Hook Form + zod

- **Shared zod schemas in `@mizan/shared`.** The same `ReviewerActionSchema` validates RHF client-side, `@hono/zod-validator` server-side, and Mastra step inputs internally. Single source of truth.
- **`zodResolver(SchemaFromShared)`.** Never inline-write a zod schema in a form component
- **shadcn `<Form>` wraps RHF.** Always use `<FormField>` + `<FormMessage>` for accessibility (label-input wiring + aria-invalid)
- **Client-side validation is for UX, not security.** Server STILL validates via `@hono/zod-validator` — never trust the client
- **`action_id` UUID generated in the form's default values.** Re-renders preserve it; `useMemo(() => crypto.randomUUID(), [])` for the row. Submission consumes it; next form mount creates a new one.

### Hono RPC + @hono/zod-validator + @hono/zod-openapi (optional)

- **Export `AppType` from the worker entry.** Chain routes with `.post().get()` so types compose; `export type AppType = typeof app` then re-export from `@mizan/shared/app-type`
- **One client instance.** `apps/web/src/lib/rpc.ts` exports `export const api = hc<AppType>('/api', { headers: () => ({ 'Idempotency-Key': uuidv4() }) })`; everywhere imports from there
- **Validate at the route definition.** Every route's body/query/param/header inputs come from `zValidator(...)` middleware so the route handler's `c.req.valid('json')` is typed + runtime-checked
- **Avoid OpenAPI codegen.** `hc<AppType>()` already gives end-to-end types; OpenAPI emission (`@hono/zod-openapi`) is for external consumers and contract tests, not for the React client
- **Reject manual `fetch(...)` calls outside `lib/rpc.ts`.** Lint rule + grep gate at PR time

### TanStack Router

- **One source of truth for routes.** Either file-based (recommended) or code-based — never mix
- **Loaders prefetch via React Query.** `loader: ({ context }) => context.queryClient.ensureQueryData(casesQuery(filters))`
- **Search-param validation via zod.** `validateSearch: SearchParamsSchema.parse` — invalid URL search params are caught at the router level
- **`beforeLoad` for auth gates.** `beforeLoad: ({ context, location }) => requireSession(context) || redirect({ to: '/login', search: { redirect: location.href } })`
- **`pendingComponent` for loader latency.** Show shadcn `<Skeleton>` while loaders resolve; never blank screens
- **No `<Link>` outside the router.** All in-app navigation goes through `<Link>` or `router.navigate(...)`; never raw `<a href>` for internal routes

### Bun workspaces + supply-chain security

- **Lockfile committed:** `bun.lock` (text JSONC, Bun 1.2+ default) is committed; CI runs `bun install --frozen-lockfile --no-cache` to reject lockfile drift and defeat any poisoned local cache. The legacy binary `bun.lockb` is NOT committed and is `.gitignore`'d defensively. Migrate any existing `bun.lockb` once via `bun install --save-text-lockfile --frozen-lockfile --lockfile-only` then `rm bun.lockb`.
- **Exact-pin versions:** `install.exact = true` in `bunfig.toml` so `package.json` records exact versions, never caret ranges. Upgrades are deliberate Renovate PRs, never accidental.
- **Bun runtime pinned:** `"packageManager": "bun@<exact>"` + `"engines.bun": ">=1.3.11"` in root `package.json`; CI uses `oven-sh/setup-bun` w/ `bun-version-file: package.json` so every machine runs identical Bun.
- **Cross-workspace deps via `workspace:*`:** never use file paths or version pins for sibling packages. `"@mizan/db": "workspace:*"` is the contract
- **Scripts use `bun --filter`:** root scripts orchestrate; `bun --filter '*' test` runs every workspace's test in parallel respecting dep order. Never `cd packages/X && bun ...` in scripts when `--filter` does it cleanly
- **No `node_modules` in workspaces:** Bun hoists; only root `node_modules` exists. Don't fight it
- **Catalogs (Bun 1.1+):** define `"catalog"` in root `package.json` for any dep shared across workspaces (`ai`, `zod`, `@ai-sdk/*`, `@cloudflare/workers-types`) and reference via `"catalog:"` in workspaces. Stops version drift across packages.
- **Scoped names:** every workspace package is `@mizan/<name>` — predictable, namespaced, never conflicts with public packages
- **`minimumReleaseAge = 1209600` (14 days):** blocks any version published <14 days ago — the bake period defeats the rapid-publish supply-chain attack pattern (Shai-Hulud variants). `minimumReleaseAgeExcludes = ["typescript", "@types/node", "@cloudflare/workers-types", "wrangler"]` for packages where rapid releases are normal and the maintainer surface is well-known.
- **`ignoreScripts = true`:** Bun already blocks dependency lifecycle scripts by default; this also blocks the project's own. `trustedDependencies` in `package.json` is the explicit allowlist — additions require PR review and a JSDoc justification linking to the audited postinstall script.
- **`install.security.scanner = "@socketsecurity/bun-security-scanner"`:** Bun 1.3 Security Scanner API wired to Socket's threat intel feed. Disables auto-install, scans every package against malware / typosquat / hijacked-maintainer signals before linking. Catches threats `bun audit` (npm advisories only) misses.
- **`registry = "https://registry.npmjs.org"` locked:** defends against accidental alt-registry pulls and bunfig override attacks.
- **`bun audit --audit-level=high` gates:** pre-commit runs `--prod` (skip dev-only CVEs to avoid blocking reviewer work); CI runs full audit. Both exit 1 on any HIGH/CRITICAL finding. Use `--ignore <CVE>` only via a tracked allowlist with a remediation deadline.
- **Renovate cadence matches install policy:** `minimumReleaseAge: "14 days"`, `rangeStrategy: "pin"`, `internalChecksFilter: "strict"`. Vulnerability alerts bypass the bake period (`minimumReleaseAge: "0 days"` for `vulnerabilityAlerts`). Auto-merge OFF — every Renovate PR is reviewed.

### oxlint + oxfmt

- **Single root config:** `.oxlintrc.json` at the repo root; per-workspace overrides via the `overrides[]` block in the same file. No `.oxlintrc` per workspace — keeps config drift out
- **Test-file relaxation:** `overrides` for `**/*.test.ts` + `**/tests/**` relax `typescript/no-explicit-any` + `typescript/no-unsafe-assignment`. Tests deserve looser rules; production code does not
- **Worker vs browser env:** `apps/worker/**` overrides to `env: { worker: true, node: false, browser: false }`; `apps/web/**` overrides to `env: { browser: true, node: false, worker: false }`. Catches misuse of `window` in worker code + Workers APIs in browser code
- **`oxlint --init` once at bootstrap, then commit:** never auto-regenerate; humans edit the config
- **CI gate:** `bun run lint` MUST pass before merge. No warnings-as-warnings escape hatch — promote critical rules to `error`
- **Type-aware rules where they pay:** `typescript/no-floating-promises` is non-negotiable for a Workers + async-heavy codebase. `typescript/no-unsafe-assignment` is `warn` because zod + AI SDK return types confuse the analyzer; revisit if it becomes noise
- **`oxfmt` over Prettier:** zero-config; runs at the same speed as the linter. `bun run format` formats the whole monorepo. CI gate is `bun run format:check`
- **No ESLint, no Prettier:** removing both is the point — half the install time, none of the plugin sprawl. If a rule you need isn't in oxlint yet, file an issue and disable locally with a comment

### Vercel AI SDK

- **Structured output:** zod schemas; never use `.min()` / `.max()` / `.regex()` on fields targeting Anthropic or OpenAI strict mode — both reject those JSON Schema keywords. Clamp ranges + validate patterns POST-parse in TypeScript helpers.
- **Streaming:** use `streamObject` / `streamText` where the client UI can render partials; use `generateObject` / `generateText` where atomicity matters (a half-extracted ID is worse than waiting for the full extraction).
- **Abort signals:** pass `c.req.raw.signal` through every AI SDK call; reviewer navigates away → in-flight calls cancel; cost saved.
- **Retries:** `maxRetries: 2` on transient 5xx; exponential backoff handled by the SDK; do not retry on schema-validation failures (they will keep failing).
- **Tool use:** every tool has zod input + output schemas; tool errors are typed and returned as part of the structured result, not thrown.
- **Telemetry:** `experimental_telemetry: { isEnabled: !!env.LANGFUSE_HOST, functionId, metadata: { caseId, runId, stepId } }` on every call — visible in Langfuse trace tree without any custom span code.
- **Provider abstraction:** ONE factory (`getModel`); no provider-specific code outside the factory; swap by env var. No `if (provider === 'anthropic')` branches in business logic.
- **Vision/multimodal:** pass file buffers as `Uint8Array` not base64-strings when possible (Workers memory); use the same vision-capable model that handles reasoning to avoid a separate OCR vendor.
- **Cost discipline:** small / fast models (e.g., `claude-haiku-4-5`, `gpt-4o-mini`) for deterministic extraction; large reasoning models only for the brief composer.

### better-auth + better-auth-cloudflare

- **Per-request init** in Hono middleware: `c.set("auth", createAuth(c.env, c.req.raw.cf, baseURL))`; never use a module-singleton auth instance — env bindings are per-request on Workers.
- **Server-side session check ONLY:** `await c.get("auth").api.getSession({ headers: c.req.raw.headers })` — never trust a session ID from the request body or query string.
- **Schema merge:** run `npx @better-auth/cli generate --config src/auth/index.ts --output src/db/auth.schema.ts -y` after every plugin change; merge with domain tables via `export const schema = { ...authSchema, cases, briefs, ... }`.
- **Apply migrations:** `wrangler d1 migrations apply DATABASE --local` for dev, `--remote` for production; never edit D1 schema by hand outside drizzle migrations.
- **Cookie attributes:** `HttpOnly`, `Secure`, `SameSite=Lax` (the better-auth defaults); production overrides only with documented reason.
- **CSRF:** better-auth's built-in CSRF for mutating endpoints; do not disable. Reviewer queue UI is same-origin so CORS-credentialled fetches work without extra wiring.
- **Rate limit:** KV-backed (`window: 60` minimum TTL). Tighten on `/sign-in/*` and any AI-cost-incurring endpoint (`/api/cases/:id/brief` should rate-limit per-reviewer).
- **Role gating:** Hono middleware factory `requireRole(role)` attached with `.use()` on route groups, NOT body-level `if (session.role !== 'reviewer')` in every handler. Declarative; cannot be skipped by a future contributor.
- **Audit:** every state-mutating call logs `(userId, action, resourceId, timestamp, requestId)` to D1. Reviewer disputes resolvable by replay.

### Cloudflare

- **Bindings, not env vars:** D1, R2, Vectorize, KV, Queue all accessed via `env.BINDING` — type-checked via `Env` interface. Secrets only via `wrangler secret put` (never `vars`).
- **Compatibility date pinned:** `compatibility_date` in `wrangler.jsonc` is explicit; do not drift; bump deliberately with changelog review.
- **`nodejs_compat` + `nodejs_compat_populate_process_env` flags:** the canonical pair Mastra's `CloudflareDeployer` generates. `nodejs_compat` is the umbrella flag (not deprecated); at `compatibility_date` ≥ 2024-09-23 it implicitly activates `nodejs_compat_v2` semantics — DO NOT add a literal `nodejs_compat_v2` string (non-standard against Mastra's tested config). Enables Buffer, crypto, process, stream, util for Mastra + AI SDK paths.
- **D1 schema migrations:** drizzle-kit only; one migration per logical change; use `wrangler d1 migrations create` to scaffold; never run raw SQL in prod.
- **D1 read performance:** indexes on every column used in WHERE / ORDER BY; D1 enforces 32MB row limit and 500MB DB max — split blobs into R2.
- **R2 access:** use the binding (`env.R2_BUCKET.get(key)`) inside the Worker; never expose R2 URLs directly to clients — use signed URLs OR proxy through the Worker with auth check.
- **R2 keys:** deterministic, content-hashed where possible (`{caseId}/{docType}/{contentHash}`); avoid mutable keys.
- **Vectorize:** index dimensions match embedding model output exactly (e.g., 1536 for `text-embedding-3-small`); embeddings re-generated only on policy-corpus version bump.
- **Queues:** at-least-once delivery — every consumer is idempotent (see §7.10); always ack OR retry, never silent-drop; DLQ configured for max-retries-exceeded.
- **Workflows vs Queues choice:** Mastra workflow runs are the durable execution layer (persisted to D1 via `@mastra/cloudflare-d1`); Cloudflare Queues are the fan-out scheduler that dispatches messages to consumer Workers which then create Mastra runs.
- **Smart Placement:** enable `placement: { mode: "smart" }` if the Worker becomes backend-heavy (LLM provider latency dominates); Cloudflare will move the Worker closer to the LLM provider data center.
- **Observability enabled:** `observability: { enabled: true }` in `wrangler.jsonc` captures Worker logs / errors / sampled requests in the CF dashboard — separate from Langfuse, which traces the AI layer specifically.
- **Cost control:** Workers Paid plan ($5/mo) covers CPU + requests; D1 / R2 / Vectorize / KV / Queues all have generous free tiers that the demo stays within.
- **Local dev:** `wrangler dev` uses Miniflare with real D1/R2/Vectorize/Queue/KV simulation — tests run against actual binding semantics, not mocks.

## 13. References (primary sources used)

- LaunchGood Applied AI Engineer JD: https://secure.collage.co/jobs/launchgood/62544
- LaunchGood Safety & Compliance: https://www.launchgood.com/safety
- LaunchGood Zakat Policy: https://www.launchgood.com/zakatpolicy
- LaunchGood ID Standards: https://support.launchgood.com/support/solutions/articles/35000214659
- LaunchGood Campaign Verification Requirements: https://support.launchgood.com/support/solutions/articles/35000217966
- LaunchGood Requirements when Creating a Campaign: https://support.launchgood.com/support/solutions/articles/35000217969
- LaunchGood Myself or Someone Else: https://support.launchgood.com/support/solutions/articles/35000197502
- LaunchGood On Behalf Of campaigns: https://support.launchgood.com/support/solutions/articles/35000197562
- LaunchGood ToU (no-scraping): https://www.launchgood.com/terms-of-use
- Operation Olive Branch (prior art for unverifiable cases): https://www.operationolivebranch.online
- GoFundMe Trust & Safety (operational baseline): https://www.gofundme.com/c/trust-and-safety
- Mizan ideation doc (full context): `outputs/launchgood-mizan-ideation.md`

**Cloudflare:**

- Workers Pricing (Paid plan $5/mo): https://developers.cloudflare.com/workers/platform/pricing/
- D1: https://developers.cloudflare.com/d1/
- R2: https://developers.cloudflare.com/r2/
- Vectorize: https://developers.cloudflare.com/vectorize/
- Queues: https://developers.cloudflare.com/queues/
- KV: https://developers.cloudflare.com/kv/

**Tooling (Bun + oxc + knip):**

- Bun workspaces: https://bun.com/docs/install/workspaces (context7 `/oven-sh/bun`)
- Bun `--filter` for monorepo scripts: https://bun.com/docs/pm/filter
- oxlint config reference: https://oxc.rs/docs/guide/usage/linter/config-file-reference (context7 `/websites/oxc_rs_guide_usage`)
- oxlint quickstart: https://oxc.rs/docs/guide/usage/linter/quickstart
- oxfmt formatter: https://oxc.rs/docs/guide/usage/formatter
- knip (dead-code detector): https://knip.dev/
- lefthook (pre-commit hooks): https://github.com/evilmartians/lefthook
- shadcn/ui: https://ui.shadcn.com/

**ORM + schema generation:**

- drizzle-orm (D1 adapter): https://orm.drizzle.team/docs/get-started-sqlite#cloudflare-d1 (context7 `/drizzle-team/drizzle-orm`)
- drizzle-kit migrations: https://orm.drizzle.team/kit-docs/overview
- drizzle-zod: https://orm.drizzle.team/docs/zod

**Client stack (TanStack + Hono RPC + RHF):**

- TanStack Query v5: https://tanstack.com/query/latest (context7 `/tanstack/query`)
- TanStack Router: https://tanstack.com/router/latest (context7 `/tanstack/router`)
- Hono RPC client (`hc`): https://hono.dev/docs/guides/rpc (context7 `/websites/hono_dev`)
- `@hono/zod-validator`: https://hono.dev/docs/guides/validation
- `@hono/zod-openapi` (optional spec emission): https://github.com/honojs/middleware/tree/main/packages/zod-openapi
- React Hook Form + zod resolver: https://react-hook-form.com / `@hookform/resolvers`
- MSW (Mock Service Worker, for testing): https://mswjs.io/

**Mastra (stack grounding via context7 + WebFetch):**

- Cloudflare deployment: https://mastra.ai/guides/deployment/cloudflare
- Hono integration: https://mastra.ai/guides/getting-started/hono
- AI SDK integration: https://mastra.ai/guides/agent-frameworks/ai-sdk
- AI SDK UI (streaming): https://mastra.ai/guides/build-your-ui/ai-sdk-ui
- Multi-agent patterns: https://mastra.ai/guides/concepts/multi-agent-systems
- Workflows: https://mastra.ai/docs/workflows/overview
- RAG: https://mastra.ai/docs/rag/overview
- Observability: https://mastra.ai/docs/observability/overview
- D1 storage adapter: `@mastra/cloudflare-d1` (via context7 `/mastra-ai/mastra`)
- AI SDK stream adapter: `@mastra/ai-sdk` — `toAISdkStream(stream, {from: 'workflow' | 'agent', version: 'v6'})`

**Auth + UI:**

- better-auth-cloudflare: https://github.com/zpg6/better-auth-cloudflare (context7 `/zpg6/better-auth-cloudflare`)
- shadcn/ui: https://ui.shadcn.com/

**Observability:**

- Langfuse Vercel AI SDK instrumentation: https://github.com/langfuse/langfuse-docs (context7 `/langfuse/langfuse-docs`)
- Langfuse self-hosting (Docker): https://langfuse.com/self-hosting

## 14. Git workflow + contribution policy

### Branches

- **`main`** — production / canonical branch. Default branch on GitHub. Protected: no direct pushes.
- **`staging`** — pre-production integration branch. Protected: no direct pushes.

No long-lived feature branches. No `develop`. No release branches. Two protected lanes only.

### Flow (every change, no exceptions)

```
feat/<short-name>  ───PR──►  staging  ───PR──►  main
```

1. Create a feature branch off `staging`: `git checkout staging && git pull && git checkout -b feat/<name>`
2. Push the feature branch, open a PR against `staging`
3. CI gates run on the PR: `bun run lint && bun run knip && bun run typecheck && bun run test`. All four MUST pass.
4. Merge to `staging` (squash or rebase merge; never plain merge commit)
5. When `staging` is ready to release: open a PR `staging → main`. CI re-runs. Merge.
6. Production deploy fires from `main` (Phase 10 of the build; production deploys only after `main` accepts the release PR)

**Forbidden:**

- Direct push to `main` (enforced by GitHub branch protection)
- Direct push to `staging` (enforced by GitHub branch protection)
- Merging your own PR without CI green
- Force-push to `main` or `staging`
- Bypassing required reviews (where configured)

### Contribution attribution

- **Sole contributor: Lahfir.** No other contributors are credited anywhere in the codebase or its surfaces — commits, PRs, code comments, READMEs, `package.json` (`author: "Lahfir"`; no `contributors` array), CHANGELOGs, release notes, docs.
- Co-author trailers (`Co-Authored-By:`) are forbidden. AI attribution markers (`Generated with Claude Code`, etc.) are forbidden.
- Every commit appears as authored solely by Lahfir.

### Commit message convention

- Conventional commits encouraged but not enforced: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `perf:`
- Subject line ≤72 chars
- Body explains the WHY, not the WHAT (the diff shows the what)
- No trailers other than `Refs: #<issue>` or `Closes: #<issue>` when applicable
