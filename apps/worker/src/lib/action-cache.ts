/**
 * Layer 4 idempotency primitives — KV cache keyed by
 * `(userId, caseId, action_id)`. Pure helpers; the route owns the
 * read/write call sites so the cache lookup runs against the
 * already-validated `c.req.valid("json")` body (no double parse).
 *
 * The cache READ side is itself revalidated with
 * `ReviewerActionResponseSchema.safeParse` so a poisoned or
 * forward-incompatible cache entry never reaches the client.
 */
import type { KVNamespace } from "@cloudflare/workers-types";
import { ReviewerActionResponseSchema, type ReviewerActionResponse } from "@mizan/shared";

const ACTION_IDEM_TTL_SECONDS = 86_400;

function actionCacheKey(userId: string, caseId: string, actionId: string): string {
  return `idem:action:${userId}:${caseId}:${actionId}`;
}

/** Persists a successful action response for Layer 4 replay protection. */
export async function cacheActionResponse(
  kv: KVNamespace,
  userId: string,
  caseId: string,
  actionId: string,
  body: ReviewerActionResponse,
): Promise<void> {
  await kv.put(actionCacheKey(userId, caseId, actionId), JSON.stringify(body), {
    expirationTtl: ACTION_IDEM_TTL_SECONDS,
  });
}

/** Returns a cached response when the same reviewer replays the action_id on the same case. */
export async function readCachedActionResponse(
  kv: KVNamespace,
  userId: string,
  caseId: string,
  actionId: string,
): Promise<ReviewerActionResponse | undefined> {
  const raw: unknown = await kv.get(actionCacheKey(userId, caseId, actionId), "json");
  if (raw === null || raw === undefined) return undefined;
  const parsed = ReviewerActionResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
