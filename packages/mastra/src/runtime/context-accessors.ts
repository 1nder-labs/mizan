import type { RequestContext } from "@mastra/core/di";
import type { CloudflareBindings } from "@mizan/shared";
import {
  MIZAN_CTX_KEY,
  MIZAN_ENV_KEY,
  parseMizanContext,
  type MizanRuntimeContext,
} from "../observability/runtime-context.ts";

function isCloudflareBindings(value: unknown): value is CloudflareBindings {
  if (typeof value !== "object" || value === null) return false;
  const dbBinding = Object.getOwnPropertyDescriptor(value, "DB")?.value;
  return typeof dbBinding === "object" && dbBinding !== null;
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
