/**
 * Layer 4 idempotency — KV cache keyed by `(userId, action_id)`.
 */
import type { KVNamespace } from "@cloudflare/workers-types";
import { createMiddleware } from "hono/factory";
import type { ReviewerActionResponse } from "@mizan/shared";
import type { CloudflareBindings } from "../env.ts";
import type { RoleVariables } from "../middleware/require-role.ts";

const ACTION_IDEM_TTL_SECONDS = 86_400;

interface CachedActionResponse {
  readonly status: 200;
  readonly body: ReviewerActionResponse;
}

function actionCacheKey(userId: string, actionId: string): string {
  return `idem:action:${userId}:${actionId}`;
}

function isCachedActionResponse(value: unknown): value is CachedActionResponse {
  if (typeof value !== "object" || value === null) return false;
  if (!("status" in value) || !("body" in value)) return false;
  return value.status === 200;
}

function readActionId(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null || !("action_id" in raw)) return undefined;
  const actionId = raw.action_id;
  return typeof actionId === "string" ? actionId : undefined;
}

/** Persists a successful action response for Layer 4 replay protection. */
export async function cacheActionResponse(
  kv: KVNamespace,
  userId: string,
  actionId: string,
  body: ReviewerActionResponse,
): Promise<void> {
  const payload: CachedActionResponse = { status: 200, body };
  await kv.put(actionCacheKey(userId, actionId), JSON.stringify(payload), {
    expirationTtl: ACTION_IDEM_TTL_SECONDS,
  });
}

/** Reads a cached action response when the same reviewer replays an action_id. */
export async function readCachedActionResponse(
  kv: KVNamespace,
  userId: string,
  actionId: string,
): Promise<CachedActionResponse | undefined> {
  const raw: unknown = await kv.get(actionCacheKey(userId, actionId), "json");
  return isCachedActionResponse(raw) ? raw : undefined;
}

export const actionIdempotency = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: RoleVariables;
}>(async (c, next) => {
  const raw: unknown = await c.req.raw.clone().json().catch(() => null);
  const actionId = readActionId(raw);
  if (actionId) {
    const cached = await readCachedActionResponse(c.env.KV, c.var.user.id, actionId);
    if (cached) {
      return c.json(cached.body, 200);
    }
  }
  await next();
  return;
});
