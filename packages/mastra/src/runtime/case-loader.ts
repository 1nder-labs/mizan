import { cases, eq, makeDb } from "@mizan/db";
import type { Case } from "@mizan/db";
import type { CloudflareBindings } from "@mizan/shared";
import { CaseOverlaySchema, type CaseOverlay } from "@mizan/shared";

export type CaseRow = Case;

export type CaseContext = CaseRow & CaseOverlay;

const CASE_CONTEXT_CACHE = new WeakMap<CloudflareBindings, Map<string, Promise<CaseContext>>>();

/** Loads the D1 case row. */
export async function loadCaseRow(env: CloudflareBindings, caseId: string): Promise<CaseRow> {
  const db = makeDb(env.DB);
  const [row] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!row) throw new Error(`case ${caseId} not found`);
  return row;
}

/**
 * Loads the D1 row plus seed overlay stored in `brief_partial_json`.
 *
 * Memoised per-request: every step in a single workflow invocation
 * receives the same `env` binding (per the Cloudflare Workers per-request
 * binding rule), so a `WeakMap<CloudflareBindings, …>` cache keyed by the
 * binding identity collapses the N step reads into a single D1 round-trip
 * without leaking across requests. The cached value is the Promise itself
 * so concurrent parallel-branch reads de-duplicate on the first call.
 */
export async function loadCaseContext(
  env: CloudflareBindings,
  caseId: string,
): Promise<CaseContext> {
  const bucket = getCacheBucket(env);
  const cached = bucket.get(caseId);
  if (cached) return cached;
  const fresh = uncachedLoad(env, caseId);
  bucket.set(caseId, fresh);
  return fresh;
}

function getCacheBucket(env: CloudflareBindings): Map<string, Promise<CaseContext>> {
  const existing = CASE_CONTEXT_CACHE.get(env);
  if (existing) return existing;
  const created = new Map<string, Promise<CaseContext>>();
  CASE_CONTEXT_CACHE.set(env, created);
  return created;
}

async function uncachedLoad(env: CloudflareBindings, caseId: string): Promise<CaseContext> {
  const row = await loadCaseRow(env, caseId);
  const overlay = parseCaseOverlay(caseId, row.brief_partial_json);
  return { ...row, ...overlay };
}

/**
 * Parses the seed overlay stored in `cases.brief_partial_json` and
 * wraps the underlying Zod failure with the offending case_id so
 * on-call operators see which row tripped. A raw `ZodError` would
 * surface in worker logs without context.
 */
function parseCaseOverlay(caseId: string, raw: unknown): CaseOverlay {
  try {
    return CaseOverlaySchema.parse(raw);
  } catch (cause) {
    throw new Error(
      `loadCaseContext: brief_partial_json failed CaseOverlaySchema for case ${caseId}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
}
