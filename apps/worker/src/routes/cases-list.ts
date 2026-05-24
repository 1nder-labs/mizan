/**
 * Queue-list + case-detail read handlers.
 *
 * Kept in a separate file from the brief-stream chain so the
 * 400 LOC ceiling holds on `cases.ts` after Phase 5 grew it.
 * Both routes are mounted into `caseRoutes` under the same
 * `requireRole(["reviewer", "admin"])` chain.
 */

import { zValidator } from "@hono/zod-validator";
import { count, desc, eq, asc, and, type SQL } from "drizzle-orm";
import { makeDb, briefs as briefsTable, cases as casesTable } from "@mizan/db";
import { QUEUE_PAGE_SIZE, QueueSearchSchema, type QueueSearch } from "@mizan/shared";
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

    const rows = await db
      .select({
        id: casesTable.id,
        status: casesTable.status,
        category: casesTable.category,
        geography: casesTable.geography,
        claimed_zakat_category: casesTable.claimed_zakat_category,
        created_at: casesTable.created_at,
        updated_at: casesTable.updated_at,
      })
      .from(casesTable)
      .where(where)
      .orderBy(orderBy)
      .limit(QUEUE_PAGE_SIZE)
      .offset(offset)
      .all();

    const totalRows = await db
      .select({ value: count() })
      .from(casesTable)
      .where(where)
      .all();
    const total = totalRows[0]?.value ?? 0;

    return c.json({
      cases: rows.map((row) => ({
        ...row,
        created_at: row.created_at.getTime(),
        updated_at: row.updated_at.getTime(),
      })),
      page: search.page,
      pageSize: QUEUE_PAGE_SIZE,
      total,
    });
  })
  .get("/:id", zValidator("param", ParamIdSchema), async (c) => {
    const { id } = c.req.valid("param");
    const db = makeDb(c.env.DB);
    const row = await db.select().from(casesTable).where(eq(casesTable.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
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
    return c.json({
      case: {
        ...row,
        created_at: row.created_at.getTime(),
        updated_at: row.updated_at.getTime(),
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
  });
