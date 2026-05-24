/**
 * Hono RPC clients for the worker's `/api` sub-app.
 *
 * Base URL `/api` aligns request URLs cleanly:
 * `api.cases.$get(...)` → `GET /api/cases`. The Vite dev proxy
 * forwards `/api` to wrangler at 8787 (see vite.config.ts).
 *
 * A worker route response change breaks every consumer at compile time
 * because both sides share `AppType` (PRD acceptance #2).
 *
 * `AppType` is sourced from `@mizan/shared` rather than `@mizan/worker`
 * directly so all cross-app type consumers have a single indirection point.
 */
import { hc } from "hono/client";
import type { AppType } from "@mizan/shared/app-type";

const BASE_URL = "/api";

/**
 * Read-only RPC client for GET queries. The worker's idempotency-key
 * middleware short-circuits on GET so no extra header is needed.
 * Use this for all TanStack Query `queryFn` calls.
 * See `apps/worker/src/middleware/idempotency-key.ts` for server-side semantics.
 */
export const api = hc<AppType>(BASE_URL);

/**
 * Mutation RPC client for POST / PATCH / DELETE calls. Injects a fresh
 * `Idempotency-Key` UUID per call so the worker's deduplication middleware
 * can safely replay any mutation exactly once on retry.
 * See `apps/worker/src/middleware/idempotency-key.ts` for server-side semantics.
 */
export const apiMutate = hc<AppType>(BASE_URL, {
  headers: () => ({ "Idempotency-Key": crypto.randomUUID() }),
});
