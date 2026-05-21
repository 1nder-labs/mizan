# Mizan

Internal AI review-brief tool for LaunchGood's Trust & Safety / Zakat team.
Mizan takes campaign materials LaunchGood already collects (creator ID, bank
statement, beneficiary ID, category-specific docs, campaign text), extracts
structured fields, matches claims to LaunchGood's published policy, surfaces
missing evidence + trust-chain signals, and produces a cited human-review
brief. AI never decides; the reviewer always acts; every action becomes an
eval case.

## Status

PRD-complete. Phase 0 (greenfield bootstrap) shipping on `feat/phase-0-bootstrap`.
Phases 1–10 build the workflow, RAG, reviewer UI, and submission package on
top of the foundation.

Single source of truth: `docs/prd.md`.

## Prerequisites

- **Bun** `>= 1.3.11` (`packageManager` field pins the exact dev + CI version)
- **Docker** (for the optional local Langfuse stack — observability only)
- **Cloudflare Workers Paid plan** ($5/mo — required for Queues)
- **Wrangler** authenticated to the Mizan Cloudflare account
  (`bunx wrangler whoami`)

## Quick start

```bash
git clone <repo-url> mizan
cd mizan

# bun install runs every package through the Socket security scanner +
# the 14-day minimumReleaseAge bake (bunfig.toml). First install is the
# slowest because the scanner has no warm cache.
bun install

# Lefthook's own postinstall is blocked by install.ignoreScripts=true,
# so install the git hooks manually exactly once after first install:
bunx lefthook install

# Sanity-check the supply chain. CI runs the same gate.
bun audit --audit-level=high

# One-time: materialise the Drizzle schema into local D1 (Phase 1+).
# Re-run after schema edits; both commands are idempotent.
bun run db:generate
bun run db:migrate:local

# Boot worker + web in parallel.
bun --filter '*' dev

# Optional (Phase 1+): seed dev reviewer + admin accounts.
# Requires the worker to be running on http://localhost:8788.
bun run db:seed

# Optional (Phase 2+): seed documentary cases + R2 doc fixtures (local only).
bun run db:seed:r2 && bun run db:seed:cases
```

Open:

- Worker health: `http://localhost:8787/health`
- Web smoke: `http://localhost:5173`

## CI gates (run locally before pushing)

```bash
bun run lint          # oxlint with the non-negotiable rule set
bun run format:check  # oxfmt
bun run typecheck     # tsc --noEmit per workspace
bun run knip          # dead-code detector
bun run audit         # bun audit, HIGH/CRITICAL gate
bun --filter '*' test # vitest + miniflare integration suite
```

All six must exit 0 before a PR can merge. The pre-commit hook (via
lefthook) runs lint + typecheck + knip + audit + a grep gate that
rejects `as any`, `as unknown`, `: any`, `// TODO|FIXME|HACK|XXX`, and
`// @ts-nocheck` in staged non-test source. The pre-push hook runs the
full test suite.

## Security posture

The supply-chain stack is enforced at install time, not in policy
documents:

- **Bun 1.3 Security Scanner API** — Socket scanner blocks malicious /
  hijacked / typosquatted packages before they link
  (`bunfig.toml` `[install.security] scanner`).
- **14-day bake period** — `bunfig.toml` `install.minimumReleaseAge =
1209600` rejects any version published less than 14 days ago, defeating
  rapid-publish supply-chain attack patterns. A small allowlist of
  high-cadence first-party packages (typescript, @types/node,
  @cloudflare/workers-types, wrangler, and the scanner itself) bypasses
  the bake.
- **No lifecycle scripts** — `install.ignoreScripts = true` blocks
  postinstall code for dependencies and the project itself.
  `trustedDependencies` is the explicit allowlist; additions require PR
  review and a JSDoc justification linking to the audited script.
- **Exact pins everywhere** — `install.exact = true` rejects caret
  ranges; `bun.lock` (text JSONC, Bun 1.2+ default) snapshots transitive
  resolution. CI runs `bun install --frozen-lockfile --no-cache`.
- **Renovate matched cadence** — `renovate.json` mirrors the 14-day
  bake; vulnerability fixes bypass it.

`docker/docker-compose.langfuse.yml` is a **dev-only** local observability
stack with hardcoded dev credentials (`NEXTAUTH_SECRET: dev-secret-not-for-production`,
`SALT: dev-salt-not-for-production`). These values are intentionally labeled and
must never be copied to any production environment. The worker's `LANGFUSE_HOST`
is unset in production deployments through Phase 7; Phase 8 wires real Langfuse
credentials exclusively via `wrangler secret put`, never via compose files or
committed env vars.

The four-layer rationale lives in `docs/prd.md` §12 and the Phase 0
brainstorm under `docs/brainstorms/`.

## Repo layout

```
apps/worker/   @mizan/worker — Cloudflare Worker (Hono + Mastra + queue consumer)
apps/web/      @mizan/web — Vite + React 19 + Tailwind 4 + shadcn UI client
packages/db/   drizzle schema + migrations + drizzle-zod
packages/mastra/    Mastra workflows + steps + tools + LLM provider factory
packages/shared/    cross-workspace zod schemas + Hono AppType re-export
packages/eval/      gold set + LLM-as-judge + cost ledger
docker/        local-only observability stack (Langfuse — NOT deployed)
docs/          prd.md (canonical) + brainstorms/ + plans/ + solutions/
scripts/       seed-users, embed-corpus, one-off utilities
```

Detailed file tree + binding map in `docs/prd.md` §10 + §11.

## Contributing

Branch workflow: `feat/<name>` off `staging` → PR into `staging` → PR
into `main`. Direct pushes to `staging` or `main` are forbidden;
force-push is forbidden. Details: `docs/prd.md` §14.

Sole contributor: Lahfir. No co-author trailers, no AI attribution
markers in commits, PRs, or any committed surface.

## License

Private — internal LaunchGood project. No public license.
