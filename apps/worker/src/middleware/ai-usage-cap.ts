/**
 * Global per-day cap on the deployment's AI usage — an abuse guardrail for the
 * shared demo URL where a reviewer (or anyone with an account) could otherwise
 * run up unbounded LLM cost via brief generation or copilot chat.
 *
 * Unlike `portal-rate-limit` (per-user, per-minute), this counts ACROSS every
 * user in a single KV bucket keyed by the UTC day, so the total spend per day
 * is bounded no matter how many accounts hammer it. Two independent buckets —
 * `brief` (expensive multi-call workflow) and `chat` (single call) — because
 * their costs differ by an order of magnitude. KV lacks atomic increment, so a
 * concurrent burst may overshoot by a few; acceptable for a cost guardrail.
 *
 * Caps are read from env (`AI_DAILY_BRIEF_CAP` / `AI_DAILY_CHAT_CAP`) so the
 * guardrail can be tightened on the live Worker with `wrangler secret put` —
 * no redeploy — and fall back to built-in defaults when unset or non-numeric.
 */
import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../env.ts";

type AiOpKind = "brief" | "chat";

const DEFAULT_DAILY_CAP: Record<AiOpKind, number> = { brief: 50, chat: 200 };
const CAP_ENV_KEY: Record<AiOpKind, "AI_DAILY_BRIEF_CAP" | "AI_DAILY_CHAT_CAP"> = {
  brief: "AI_DAILY_BRIEF_CAP",
  chat: "AI_DAILY_CHAT_CAP",
};
const KEY_TTL_SECONDS = 60 * 60 * 36;
const RETRY_AFTER_SECONDS = 60 * 60;

/** Resolves the configured cap for a kind, falling back to the default for unset/invalid env. */
function resolveCap(env: CloudflareBindings, kind: AiOpKind): number {
  const raw = env[CAP_ENV_KEY[kind]];
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_CAP[kind];
}

/** `YYYY-MM-DD` in UTC — the bucket boundary for the daily counter. */
function utcDayStamp(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Decides whether a request should be charged against the daily bucket, read
 * AFTER the downstream handler ran. Only a request that actually consumed AI
 * counts: the response must be a success (a 4xx — terminal 409, cross-org 404,
 * over-cap path — is not charged), and for `brief` it must be a FRESH claim, not
 * a rejoin/replay. A reviewer looping rejoin POSTs on an in-flight case
 * (`replay === true`) therefore can NOT drain the org-wide bucket — the bug this
 * guards against. `chat` has no producer guard, so any successful chat charges.
 */
function shouldCharge(
  kind: AiOpKind,
  c: { res: { status: number }; var: { replay?: boolean } },
): boolean {
  if (c.res.status >= 400) return false;
  if (kind === "brief") return c.var.replay === false;
  return true;
}

/**
 * Builds the global daily-cap gate for an AI operation. Mount AFTER cheaper
 * guards (idempotency, validation) and BEFORE any step that claims state (e.g.
 * `producerGuard`), so a capped request is rejected (429) before the case is
 * transitioned. The increment happens AFTER `next()`, gated by `shouldCharge`,
 * so rejoin replays and rejected requests never burn quota.
 */
export function aiDailyCap(kind: AiOpKind) {
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: { replay?: boolean } }>(
    async (c, next) => {
      const cap = resolveCap(c.env, kind);
      const key = `ai-cap:${kind}:${utcDayStamp(Date.now())}`;
      const used = Number.parseInt((await c.env.KV.get(key)) ?? "0", 10);

      if (used >= cap) {
        c.header("Retry-After", String(RETRY_AFTER_SECONDS));
        return c.json(
          { error: "ai_daily_limit", message: "Daily AI usage limit reached. Try again tomorrow." },
          429,
        );
      }

      await next();

      if (shouldCharge(kind, c)) {
        await c.env.KV.put(key, String(used + 1), { expirationTtl: KEY_TTL_SECONDS });
      }
      return;
    },
  );
}
