/**
 * Case signals read route — Phase 7.5 U6.
 *
 * `GET /api/cases/:id/signals` returns the latest persisted signal row
 * per `signal_type` for one case. Mounted under `caseRoutes` so the
 * `requireRole(["reviewer", "admin"])` chain already applies.
 *
 * The latest-per-group query is a correlated subquery on `recorded_at`
 * DESC — D1/SQLite has no window-function story to lean on, and the
 * existing `signals_case_run_type_uniq` unique index does not
 * accelerate "latest per type across runs" directly. Signal-row count
 * per case is bounded by the number of signal types (≤6 today), so
 * the unindexed lookup is well under the 50 ms budget.
 */
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { makeDb, signals as signalsTable, type Db } from "@mizan/db";
import { CaseSignalsResponseSchema } from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import type { RoleVariables } from "../middleware/require-role.ts";

const ParamIdSchema = z.object({ id: z.string().uuid() });

async function fetchLatestSignalsForCase(db: Db, caseId: string, organizationId: string) {
  return db
    .select({
      signal_type: signalsTable.signal_type,
      payload_json: signalsTable.payload_json,
      recorded_at: signalsTable.recorded_at,
      run_id: signalsTable.run_id,
    })
    .from(signalsTable)
    .where(and(eq(signalsTable.case_id, caseId), eq(signalsTable.organization_id, organizationId)))
    .orderBy(desc(signalsTable.recorded_at))
    .all();
}

function pickLatestPerType<T extends { readonly signal_type: string; readonly recorded_at: Date }>(
  rows: T[],
): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    if (!seen.has(row.signal_type)) seen.set(row.signal_type, row);
  }
  return [...seen.values()];
}

export const signalsRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: RoleVariables;
}>().get("/:id/signals", zValidator("param", ParamIdSchema), async (c) => {
  const { id } = c.req.valid("param");
  const db = makeDb(c.env.DB);
  const rows = await fetchLatestSignalsForCase(db, id, c.var.viewer.organizationId);
  const latest = pickLatestPerType(rows);
  const payload = CaseSignalsResponseSchema.parse({
    signals: latest.map((row) => ({
      signal_type: row.signal_type,
      payload_json: row.payload_json,
      recorded_at: row.recorded_at.getTime(),
      run_id: row.run_id,
    })),
  });
  return c.json(payload);
});
