/**
 * Queue-list + case-detail read handlers.
 *
 * Kept in a separate file from the brief-stream chain so the
 * 400 LOC ceiling holds on `cases.ts` after Phase 5 grew it.
 * Both routes are mounted into `caseRoutes` under the same
 * `requireRole(["reviewer", "admin"])` chain.
 */

import { zValidator } from "@hono/zod-validator";
import { count, desc, eq, asc, and, sql, type SQL } from "drizzle-orm";
import {
  caseListProjection,
  makeDb,
  briefs as briefsTable,
  cases as casesTable,
  type Db,
} from "@mizan/db";
import {
  QUEUE_PAGE_SIZE,
  QueueResponseSchema,
  QueueSearchSchema,
  CaseDetailResponseSchema,
  VerificationPathSchema,
  type CaseDetailResponse,
  type QueueSearch,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import type { ProducerVariables } from "../middleware/producer-guard.ts";

const ParamIdSchema = z.object({ id: z.string().uuid() });

function buildFilters(search: QueueSearch): SQL | undefined {
  const filters: SQL[] = [];
  if (search.status) filters.push(eq(casesTable.status, search.status));
  if (search.category) filters.push(eq(casesTable.category, search.category));
  if (search.geography) filters.push(eq(casesTable.geography, search.geography));
  if (filters.length === 0) return undefined;
  return filters.length === 1 ? filters[0] : and(...filters);
}

function buildOrder(sort: QueueSearch["sort"]): SQL {
  if (sort === "updated_asc") return asc(casesTable.updated_at);
  if (sort === "created_desc") return desc(casesTable.created_at);
  return desc(casesTable.updated_at);
}

/**
 * Extracts the latest brief's recommendation + verification_path for a
 * given case from the briefs table. Uses a correlated subquery selecting
 * the most-recent composed_at row so the JOIN is a single lookup per case.
 *
 * Returns null fields when no brief exists for the case.
 */
function latestBriefSubquery(caseIdCol: SQL) {
  return {
    latestRecommendation: sql<string | null>`(
      SELECT recommendation FROM briefs
      WHERE briefs.case_id = ${caseIdCol}
      ORDER BY briefs.composed_at DESC
      LIMIT 1
    )`,
    latestVerificationPath: sql<string | null>`(
      SELECT json_extract(payload_json, '$.verification_path') FROM briefs
      WHERE briefs.case_id = ${caseIdCol}
      ORDER BY briefs.composed_at DESC
      LIMIT 1
    )`,
  };
}

/**
 * Converts a raw DB recommendation + verification_path pair from the
 * correlated subquery into the typed `latest_brief` shape.
 * Returns null when the case has no brief.
 */
function resolveLatestBrief(
  recommendation: string | null,
  rawPath: string | null,
): { recommendation: string; verification_path: string } | null {
  if (recommendation === null || rawPath === null) return null;
  const verification_path = VerificationPathSchema.parse(rawPath);
  return { recommendation, verification_path };
}

/**
 * Fetches the case row + latest brief from D1 and assembles the validated
 * `CaseDetailResponse` payload. Extracted to keep the route handler ≤50 LOC.
 * Returns null when the case does not exist.
 */
async function fetchDetailPayload(db: Db, id: string): Promise<CaseDetailResponse | null> {
  const projection = caseListProjection();
  const row = await db.select(projection).from(casesTable).where(eq(casesTable.id, id)).get();
  if (!row) return null;

  const brief = await db
    .select({
      recommendation: briefsTable.recommendation,
      confidence: briefsTable.confidence,
      composed_at: briefsTable.composed_at,
      payload_json: briefsTable.payload_json,
    })
    .from(briefsTable)
    .where(eq(briefsTable.case_id, id))
    .orderBy(desc(briefsTable.composed_at))
    .limit(1)
    .get();

  const latestBrief = brief
    ? resolveLatestBrief(brief.recommendation, brief.payload_json?.verification_path ?? null)
    : null;

  return CaseDetailResponseSchema.parse({
    case: {
      id: row.id,
      status: row.status,
      category: row.category,
      geography: row.geography,
      claimed_zakat_category: row.claimed_zakat_category,
      created_at: row.created_at.getTime(),
      updated_at: row.updated_at.getTime(),
      latest_brief: latestBrief,
    },
    brief: brief
      ? {
          recommendation: brief.recommendation,
          confidence: brief.confidence,
          composed_at: brief.composed_at.getTime(),
          payload_json: brief.payload_json,
        }
      : null,
  });
}

export const casesListRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>()
  .get("/", zValidator("query", QueueSearchSchema), async (c) => {
    const search = c.req.valid("query");
    const db = makeDb(c.env.DB);
    const where = buildFilters(search);
    const orderBy = buildOrder(search.sort);
    const offset = (search.page - 1) * QUEUE_PAGE_SIZE;

    const projection = caseListProjection();
    const briefCols = latestBriefSubquery(sql`${casesTable.id}`);

    const [rows, totalRows] = await Promise.all([
      db
        .select({ ...projection, ...briefCols })
        .from(casesTable)
        .where(where)
        .orderBy(orderBy)
        .limit(QUEUE_PAGE_SIZE)
        .offset(offset)
        .all(),
      db.select({ value: count() }).from(casesTable).where(where).all(),
    ]);

    const total = totalRows[0]?.value ?? 0;

    const payload = QueueResponseSchema.parse({
      cases: rows.map((row) => ({
        id: row.id,
        status: row.status,
        category: row.category,
        geography: row.geography,
        claimed_zakat_category: row.claimed_zakat_category,
        created_at: row.created_at.getTime(),
        updated_at: row.updated_at.getTime(),
        latest_brief: resolveLatestBrief(row.latestRecommendation, row.latestVerificationPath),
      })),
      page: search.page,
      pageSize: QUEUE_PAGE_SIZE,
      total,
    });

    return c.json(payload);
  })
  .get("/:id", zValidator("param", ParamIdSchema), async (c) => {
    const { id } = c.req.valid("param");
    const db = makeDb(c.env.DB);
    const payload = await fetchDetailPayload(db, id);
    if (!payload) return c.json({ error: "not_found" }, 404);
    return c.json(payload);
  });
