---
module: mizan-monorepo
date: 2026-05-24
problem_type: architecture_pattern
component: tooling
severity: high
related_components:
  - apps/web
  - apps/worker
  - packages/shared
  - packages/db
  - packages/mastra
  - packages/eval
tags:
  - typescript
  - bun-workspace
  - hono-rpc
  - type-only-reexport
  - apptype
  - subpath-exports
applies_when:
  - "Re-exporting a type from one workspace package through another (e.g. Hono AppType, tRPC AppRouter)"
  - "The source package transitively imports environment-specific globals not present in every consumer"
  - "Consumers of the re-export package have heterogeneous tsconfig lib / types arrays"
---

# Cross-package type-only re-exports: use a subpath export, never the main barrel

## Context

Phase 6 (`feat: Phase 6 — reviewer UI`) needed `apps/web` to consume `AppType` from `apps/worker` for Hono RPC (`hc<AppType>("/api")`). The plan called for re-exporting through `@mizan/shared` so the dependency direction stayed clean: `apps/web` depends only on `@mizan/shared`, never directly on `@mizan/worker`.

The naïve implementation re-exported `AppType` from `packages/shared/src/index.ts` (the main barrel). Every consumer of `@mizan/shared` — `@mizan/db`, `@mizan/mastra`, `@mizan/eval` — then transitively pulled in the entire worker import chain: `index.ts → middleware/auth-init.ts → auth/index.ts → better-auth/withCloudflare`, which references `IncomingRequestCfProperties`, `AbortSignal`, `console`, `crypto`, and `Request.cf`.

`@mizan/eval`, `@mizan/db`, and `@mizan/mastra` carry their own narrow `lib` / `types` arrays (no `WebWorker`, no `@cloudflare/workers-types`). `bun run typecheck` started failing across three packages with errors like:

```
@mizan/eval typecheck: ../../apps/worker/src/middleware/auth-init.ts(22,45):
  error TS2339: Property 'cf' does not exist on type 'Request'.
@mizan/db typecheck: ../../apps/worker/src/middleware/auth-init.ts(22,45):
  error TS2339: Property 'cf' does not exist on type 'Request'.
@mizan/mastra typecheck: ../../apps/worker/src/middleware/auth-init.ts(22,45):
  error TS2339: Property 'cf' does not exist on type 'Request'.
```

None of those packages reference `AppType`. They imported only schemas / zod helpers from `@mizan/shared`, but tsc still had to resolve the AppType re-export the moment they touched the main barrel.

## Guidance

When re-exporting a type from one workspace package through another, expose it ONLY via a subpath export. Never re-export from the main barrel.

```jsonc
// packages/shared/package.json
{
  "exports": {
    ".": "./src/index.ts",
    "./app-type": "./src/app-type.ts",
    "./testing": "./src/testing.ts",
  },
}
```

```ts
// packages/shared/src/app-type.ts
export type { AppType } from "@mizan/worker/index";
```

```ts
// packages/shared/src/index.ts
// Do NOT add `export type { AppType } from "./app-type.ts"` here.
// Keep the worker import chain off the main barrel.
```

Consumers opt in at the import site:

```ts
// apps/web/src/lib/rpc.ts
import type { AppType } from "@mizan/shared/app-type";

export const api = hc<AppType>("/api");
```

The re-export package still needs the lib + types coverage for its own `tsc --noEmit -p tsconfig.json` to succeed:

```jsonc
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ESNext", "WebWorker"],
    "types": ["@cloudflare/workers-types"],
  },
}
```

And the workspace dep is type-only:

```jsonc
// packages/shared/package.json
{
  "devDependencies": {
    "@mizan/worker": "workspace:*",
  },
}
```

## Why This Matters

A type-only re-export looks free at the import site — `export type { ... }` gets erased at runtime. But TypeScript still resolves the entire chain at compile time on every consumer. If the chain reaches code that uses environment-specific globals (Cloudflare bindings, DOM `Request.cf`, Node-only APIs), every package whose tsconfig lacks those libs starts failing typecheck even if the consumer never touches the type.

A subpath export contains the chain to the files that actually import it. `@mizan/db` doing `import { Case } from "@mizan/shared"` does not resolve `app-type.ts` because it lives behind a different exports entry. Only `apps/web` (which imports from `@mizan/shared/app-type`) pays the resolution cost, and `apps/web/tsconfig.json` already has the lib coverage to absorb it.

This generalises beyond Hono RPC. Any "type bridge" that crosses an environment boundary (a Worker type into a browser app, a Node service type into an edge function, etc.) benefits from the same pattern. The dependency-direction principle still holds — consumers depend on the bridge package, not the source — but the bridge package keeps the bridge off the main barrel.

## When to Apply

- The source package contains code that references environment globals (Workers, DOM, Node) not shared with all downstream consumers.
- The re-export is type-only (`export type { ... }`).
- The bridge package has multiple consumers with heterogeneous tsconfig environments.
- You want a single canonical import path (`@mizan/shared/app-type`) without forcing every consumer to typecheck the entire source package.

## Examples

### Before — main-barrel re-export (broken)

```ts
// packages/shared/src/index.ts
export type { AppType } from "@mizan/worker/index";
export { CaseRowSchema, QueueResponseSchema /* ... */ } from "./schemas/...";
```

```ts
// apps/web/src/lib/rpc.ts
import type { AppType } from "@mizan/shared";
```

```ts
// packages/eval/src/some-script.ts
import { CaseRowSchema } from "@mizan/shared";
// tsc now resolves AppType -> worker/index -> middleware/auth-init.ts
// fails: Property 'cf' does not exist on type 'Request'.
```

### After — subpath export (works)

```jsonc
// packages/shared/package.json
{
  "exports": {
    ".": "./src/index.ts",
    "./app-type": "./src/app-type.ts",
  },
  "devDependencies": {
    "@mizan/worker": "workspace:*",
  },
}
```

```ts
// packages/shared/src/app-type.ts
export type { AppType } from "@mizan/worker/index";
```

```ts
// packages/shared/src/index.ts
// AppType deliberately NOT re-exported here.
export { CaseRowSchema, QueueResponseSchema /* ... */ } from "./schemas/...";
```

```ts
// apps/web/src/lib/rpc.ts
import type { AppType } from "@mizan/shared/app-type";

export const api = hc<AppType>("/api");
```

```ts
// packages/eval/src/some-script.ts
import { CaseRowSchema } from "@mizan/shared";
// tsc resolves only ./schemas/* — worker chain untouched. Clean.
```

### Verification gate

After the move, `bun run typecheck` should exit 0 across every workspace package:

```
@mizan/shared typecheck: Exited with code 0
@mizan/db typecheck: Exited with code 0
@mizan/eval typecheck: Exited with code 0
@mizan/mastra typecheck: Exited with code 0
@mizan/web typecheck: Exited with code 0
@mizan/worker typecheck: Exited with code 0
```

A contract snapshot test at `apps/web/tests/contract/app-type-snapshot.test.ts` pins the response shape so worker drift breaks compile at the consumer rather than degrading silently at runtime.

## Anti-pattern checklist

- ❌ `export type { AppType } from "./app-type.ts"` in `packages/shared/src/index.ts`
- ❌ `import type { AppType } from "@mizan/shared"` (main barrel) in any consumer
- ❌ Adding the source package as `dependencies` instead of `devDependencies` on the bridge — that ships the source at runtime even though only types cross the boundary
- ❌ Re-introducing the main-barrel re-export to "make imports cleaner" — the cascade returns the moment a transitive consumer's tsconfig lacks the source's lib coverage

## Related references

- `apps/web/src/lib/rpc.ts` — consumer side
- `packages/shared/src/app-type.ts` — bridge implementation
- `packages/shared/package.json` — exports map + devDependency
- `apps/web/tests/contract/app-type-snapshot.test.ts` — compile-time drift gate
- Hono RPC docs: https://hono.dev/docs/guides/rpc — the canonical `hc<AppType>()` pattern
