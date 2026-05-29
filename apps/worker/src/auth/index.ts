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

  // @ts-ignore better-auth-cloudflare@0.3.0 vs better-auth@1.6.x plugin endpoint signature drift
  const auth = betterAuth({
    baseURL,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    ...withCloudflare(buildCloudflareOptions(env, cf), RATE_LIMIT_OPTIONS),
    ...cliDatabase,
    plugins: [
      organization({
        creatorRole: "admin",
        allowUserToCreateOrganization: true,
        invitationExpiresIn: 48 * 60 * 60,
      }),
    ],
    ...(env
      ? {
          databaseHooks: buildOrgDatabaseHooks(
            () => makeDb(env.DB),
            (): AuthLike => auth,
          ),
        }
      : {}),
  });

  return auth;
}

/** CLI-mode singleton — consumed by `@better-auth/cli generate` only. */
export const auth = createAuth();
