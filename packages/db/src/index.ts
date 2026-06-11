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
import * as documentsSchema from "./documents.schema.ts";
import * as domainSchema from "./schema.ts";

export const schema = { ...authSchema, ...domainSchema, ...documentsSchema } as const;

export type Schema = typeof schema;

/** Creates a per-request Drizzle D1 client with the merged schema attached. */
export function makeDb(d1: AnyD1Database): DrizzleD1Database<Schema> {
  return drizzle(d1, { schema, logger: false });
}

export type Db = ReturnType<typeof makeDb>;

export * from "./schema.ts";
export * from "./documents.schema.ts";
export * from "./auth.schema.ts";
export * from "./schemas.ts";
export { transitionCase, type CaseTransitionInput } from "./case-transitions.ts";
export { caseListProjection } from "./projections.ts";
export { fetchAuditPage, type AuditRow } from "./audit.ts";
export { resolveCaseOrganizationId } from "./case-org.ts";
export {
  currentExtractedDocument,
  currentExtractedKeys,
  documentById,
  insertDocumentIfOwned,
  latestDocumentUploadMs,
  listCaseDocuments,
  type DocumentRow,
  type ExtractedDocumentKeys,
  type InsertDocumentInput,
} from "./document-queries.ts";
export { archiveCase } from "./archive-case.ts";
export { emitLiveEvent, executeEmit, type EmitLiveEventInput } from "./emit-live-event.ts";
export {
  batchTransitionWithEmits,
  buildActionEmits,
  buildArchivedEmits,
  buildResubmittedEmits,
  buildAssignmentEmits,
  buildBriefReadyEmits,
  buildSignalPersistedEmits,
  buildStatusChangedEmits,
  caseTopic,
  emitLiveEventsBestEffort,
  orgTopic,
  userTopic,
} from "./live-event-builders.ts";
export { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
