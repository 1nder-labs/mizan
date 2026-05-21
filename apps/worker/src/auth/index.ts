/**
 * Dual-mode `createAuth` factory for better-auth + better-auth-cloudflare.
 *
 * **Runtime mode** (`env` present): called per-request inside the `authInit`
 * middleware so that live Cloudflare bindings (D1, KV, R2) are resolved
 * from the request's env. Workers do not expose module-level singletons for
 * bindings; per-request init is the only correct pattern (PRD §12).
 *
 * **CLI mode** (`env` absent): `export const auth = createAuth()` at the
 * bottom of this file is the entry point for `@better-auth/cli generate`.
 * The CLI needs a drizzle-adapter attached so it can introspect the schema
 * and emit migration SQL. An empty object satisfies the adapter's open
 * `DB` interface structurally — no runtime call paths exercise it, so the
 * placeholder is safe and no cast is required.
 */

import type { IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "@mizan/db";
import type { CloudflareBindings } from "../env.ts";

const R2_MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_UPLOAD_TYPES = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];

/**
 * Builds the first arg to `withCloudflare`.
 *
 * In CLI mode (`env` undefined) only the geolocation/cf scaffold is returned
 * — no `d1`/`kv`/`r2` bindings exist outside a request. The CLI-mode
 * `drizzleAdapter` is attached separately via spread in `createAuth`.
 */
function buildCloudflareOptions(
  env: CloudflareBindings | undefined,
  cf: Partial<IncomingRequestCfProperties>,
) {
  if (!env) {
    return { autoDetectIpAddress: true, geolocationTracking: true, cf };
  }
  const db = drizzle(env.DB, { schema, logger: false });
  return {
    autoDetectIpAddress: true,
    geolocationTracking: true,
    cf,
    d1: { db, options: { usePlural: true } },
    kv: env.KV,
    r2: {
      bucket: env.R2_BUCKET,
      maxFileSize: R2_MAX_FILE_SIZE,
      allowedTypes: ALLOWED_UPLOAD_TYPES,
    },
  };
}

const RATE_LIMIT_OPTIONS = {
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
    },
  },
};

/**
 * Creates a fully-configured better-auth instance.
 *
 * Call with `(env, cf, origin)` inside Hono request handlers.
 * Call with no arguments for CLI schema-generation mode.
 *
 * The single `@ts-expect-error` below tracks an upstream typing bug in
 * `better-auth-cloudflare@0.3.0`: its plugin declares optional endpoints
 * (e.g. `endpoints.upload?: StrictEndpoint`) which is structurally
 * incompatible with `better-auth`'s `BetterAuthPlugin.endpoints?: { [key:
 * string]: Endpoint }` (no `undefined` allowed in the index signature).
 * Runtime behaviour is correct — the plugin omits the undefined key when
 * R2 is not configured; only the type narrowing fails. Revisit when
 * `better-auth-cloudflare` ships a 0.4.x with declared `Endpoint`-typed
 * endpoints (Renovate-watched).
 */
export function createAuth(
  env?: CloudflareBindings,
  cf: Partial<IncomingRequestCfProperties> = {},
  baseURL?: string,
) {
  const cliDatabase = env
    ? {}
    : { database: drizzleAdapter({}, { provider: "sqlite", usePlural: true }) };

  // @ts-expect-error better-auth-cloudflare@0.3.0 declares optional plugin endpoints incompatible with better-auth@1.6.x index signature
  return betterAuth({
    baseURL,
    user: {
      additionalFields: {
        role: {
          type: ["reviewer", "admin"],
          required: false,
          defaultValue: "reviewer",
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    ...withCloudflare(buildCloudflareOptions(env, cf), RATE_LIMIT_OPTIONS),
    ...cliDatabase,
  });
}

/** CLI-mode singleton — consumed by `@better-auth/cli generate` only. */
export const auth = createAuth();
