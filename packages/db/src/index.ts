/**
 * Canonical barrel for `@mizan/db`.
 *
 * `schema` is the runtime aggregate consumed by `drizzle()` and by
 * `betterAuth({ database: { db, schema } })`. It spreads both the
 * auth tables (users, sessions, accounts, verifications) and the five
 * domain tables (cases, briefs, signals, reviewer_actions, workflow_events)
 * so Drizzle's relational query builder sees the full cross-schema graph.
 *
 * `makeDb` is the per-request D1 client factory used by Hono handlers:
 *
 * ```ts
 * const db = makeDb(env.DB);
 * await db.query.cases.findMany({ ... });
 * ```
 *
 * `D1Database` is accepted as `AnyD1Database` — drizzle-orm's own union type
 * that resolves to the runtime global `D1Database` inside Workers and to
 * `@miniflare/d1`'s type in test environments. This keeps `packages/db` free
 * of a direct `@cloudflare/workers-types` dev-dep while remaining structurally
 * compatible with the binding type used in `apps/worker/src/env.ts`.
 */

import { drizzle, type AnyD1Database, type DrizzleD1Database } from "drizzle-orm/d1";
import * as authSchema from "./auth.schema.ts";
import * as domainSchema from "./schema.ts";

export const schema = { ...authSchema, ...domainSchema } as const;

export type Schema = typeof schema;

/** Creates a per-request Drizzle D1 client with the merged schema attached. */
export function makeDb(d1: AnyD1Database): DrizzleD1Database<Schema> {
  return drizzle(d1, { schema, logger: false });
}

export type Db = ReturnType<typeof makeDb>;

export * from "./schema.ts";
export * from "./auth.schema.ts";
export * from "./zod.ts";
export type { BriefPayload } from "@mizan/mastra";
export { and, eq, inArray } from "drizzle-orm";
