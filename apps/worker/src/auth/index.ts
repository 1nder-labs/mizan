/**
 * Dual-mode `createAuth` factory for better-auth + better-auth-cloudflare.
 */

import type { IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { withCloudflare } from "better-auth-cloudflare";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { makeDb, schema } from "@mizan/db";
import type { CloudflareBindings } from "../env.ts";
import { buildOrgDatabaseHooks } from "./org-hooks.ts";
import { orgAccessControl, orgRoles } from "./org-access.ts";
import { resolveReviewOrgId } from "../lib/review-org.ts";
import type { AuthLike } from "./org-invitations.ts";

const R2_MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_UPLOAD_TYPES = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];

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
 * Builds the `databaseHooks` option for the betterAuth config — the org
 * auto-provision + active-org seeding hooks — or an empty object in
 * CLI/schema-generation mode (no `env`). Extracted so `createAuth` stays
 * within the 50-line cap; `getAuth` is the lazy self-reference the hooks use
 * to reach the org plugin's server-only API once `auth` is constructed.
 */
function buildDatabaseHooksOption(env: CloudflareBindings | undefined, getAuth: () => AuthLike) {
  if (!env) return {};
  return {
    databaseHooks: buildOrgDatabaseHooks(
      () => makeDb(env.DB),
      getAuth,
      () => resolveReviewOrgId(env),
    ),
  };
}

/**
 * Creates a fully-configured better-auth instance.
 *
 * Call with `(env, cf, origin, headers)` inside Hono request handlers.
 * Call with no arguments for CLI schema-generation mode.
 */
export function createAuth(
  env?: CloudflareBindings,
  cf: Partial<IncomingRequestCfProperties> = {},
  baseURL?: string,
) {
  const cliDatabase = env
    ? {}
    : { database: drizzleAdapter({}, { provider: "sqlite", usePlural: true }) };

  const auth = betterAuth({
    baseURL,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        signupKind: {
          type: "string",
          required: false,
          defaultValue: "internal",
          input: true,
        },
      },
    },
    ...withCloudflare(buildCloudflareOptions(env, cf), RATE_LIMIT_OPTIONS),
    ...cliDatabase,
    plugins: [
      organization({
        ac: orgAccessControl,
        roles: orgRoles,
        creatorRole: "admin",
        allowUserToCreateOrganization: true,
        invitationExpiresIn: 48 * 60 * 60,
      }),
    ],
    ...buildDatabaseHooksOption(env, (): AuthLike => auth),
  });

  return auth;
}

/** CLI-mode singleton — consumed by `@better-auth/cli generate` only. */
export const auth = createAuth();
