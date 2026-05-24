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
 * `AppType` is sourced from `@mizan/shared/app-type` (subpath export)
 * so the worker import chain stays off the main `@mizan/shared` barrel
 * and other workspace packages don't transitively typecheck the worker.
 */
import { hc } from "hono/client";
import type { AppType } from "@mizan/shared/app-type";

const BASE_URL = "/api";

interface RpcFactoryOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly baseUrl?: string;
}

/**
 * Builds a read-only Hono RPC client. GETs need no `Idempotency-Key`
 * (worker middleware short-circuits on GET) so the client carries no
 * mutating header. Exposed for tests + advanced overrides.
 */
export function createApi(options: RpcFactoryOptions = {}): ReturnType<typeof hc<AppType>> {
  return hc<AppType>(options.baseUrl ?? BASE_URL, options.fetch ? { fetch: options.fetch } : {});
}

/**
 * Builds a mutation client that injects a fresh `Idempotency-Key` UUID
 * on every request so the worker's deduplication middleware safely
 * replays any mutation exactly once on retry. Header factory runs per
 * call regardless of method — callers MUST route GETs through `api`
 * (the bare client) to avoid noisy headers on read paths.
 */
export function createApiMutate(
  options: RpcFactoryOptions = {},
): ReturnType<typeof hc<AppType>> {
  return hc<AppType>(options.baseUrl ?? BASE_URL, {
    headers: () => ({ "Idempotency-Key": crypto.randomUUID() }),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

export const api = createApi();
export const apiMutate = createApiMutate();
