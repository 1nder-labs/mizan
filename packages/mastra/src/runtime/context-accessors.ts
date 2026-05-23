import type { RequestContext } from "@mastra/core/di";
import type { CloudflareBindings } from "@mizan/shared";
import {
  MIZAN_CTX_KEY,
  MIZAN_ENV_KEY,
  parseMizanContext,
  type MizanRuntimeContext,
} from "../observability/runtime-context.ts";

/**
 * Required binding handles the Mastra runtime expects on every
 * request. Validated separately from env-var fields because a missing
 * handle (KV, R2, queue, vectorize, fetcher) almost always means a
 * `wrangler.jsonc` regression — surfacing the gap here, at the
 * boundary, prevents downstream `cannot read 'put' of undefined`
 * crashes deep inside a step's persistence path.
 */
const REQUIRED_BINDING_KEYS = [
  "DB",
  "KV",
  "R2_BUCKET",
  "VECTORIZE",
  "BRIEF_QUEUE",
  "ASSETS",
] as const;

function isCloudflareBindings(value: unknown): value is CloudflareBindings {
  if (typeof value !== "object" || value === null) return false;
  for (const key of REQUIRED_BINDING_KEYS) {
    if (!(key in value)) return false;
    const binding = Object.getOwnPropertyDescriptor(value, key)?.value;
    if (typeof binding !== "object" || binding === null) return false;
  }
  return true;
}

/** Reads Cloudflare bindings from the Mastra request context. */
export function getEnv(rc: RequestContext): CloudflareBindings {
  const env = rc.get(MIZAN_ENV_KEY);
  if (!isCloudflareBindings(env)) {
    throw new Error("request context missing Cloudflare bindings");
  }
  return env;
}

/** Reads Mizan runtime metadata from the Mastra request context. */
export function getCtx(rc: RequestContext): MizanRuntimeContext {
  return parseMizanContext(rc.get(MIZAN_CTX_KEY));
}

export { MIZAN_ENV_KEY };
