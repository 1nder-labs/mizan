/**
 * SSE stream of `workflow_events` for case resumability.
 */
import { and, eq, gt, makeDb, workflow_events, cases, type Case } from "@mizan/db";
import { TERMINAL_CASE_STATUSES, toWorkflowEventWire } from "@mizan/shared";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { CloudflareBindings } from "../env.ts";
import type { ProducerVariables } from "../middleware/producer-guard.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";
import {
  LIVE_TAIL_INTERVAL_MS,
  onSseStreamError,
  RECONNECT_BACKOFF_MS,
  STREAM_WALL_CLOCK_MS,
} from "./sse-constants.ts";

type StreamContext = Context<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables & ViewerVariables;
}>;

type StreamApi = {
  writeSSE: (payload: {
    id?: string;
    event?: string;
    data: string;
    retry?: number;
  }) => Promise<void>;
  sleep: (ms: number) => Promise<unknown>;
};

type WorkflowEventRow = Awaited<ReturnType<typeof fetchEventsAfterSeq>>[number];

function parseLastEventId(header: string | undefined): number {
  if (!header) return 0;
  const parsed = Number.parseInt(header, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function fetchEventsAfterSeq(db: ReturnType<typeof makeDb>, runId: string, afterSeq: number) {
  return db
    .select()
    .from(workflow_events)
    .where(and(eq(workflow_events.run_id, runId), gt(workflow_events.seq, afterSeq)))
    .orderBy(workflow_events.seq);
}

async function writeEventRow(stream: StreamApi, row: WorkflowEventRow): Promise<void> {
  const wire = toWorkflowEventWire({
    seq: row.seq,
    event_type: row.event_type,
    step_id: row.step_id,
    emitted_at: row.emitted_at,
    payload_json: row.payload_json ?? null,
  });
  await stream.writeSSE({
    id: String(row.seq),
    event: row.event_type,
    data: JSON.stringify(wire),
  });
}

async function emitRows(
  stream: StreamApi,
  rows: WorkflowEventRow[],
  cursor: number,
): Promise<{ finished: boolean; lastSeen: number }> {
  let lastSeen = cursor;
  for (const row of rows) {
    await writeEventRow(stream, row);
    lastSeen = row.seq;
    if (row.event_type === "workflow.finish") {
      return { finished: true, lastSeen };
    }
  }
  return { finished: false, lastSeen };
}

async function safeFetch(
  db: ReturnType<typeof makeDb>,
  runId: string,
  afterSeq: number,
  stream: StreamApi,
): Promise<WorkflowEventRow[] | undefined> {
  try {
    return await fetchEventsAfterSeq(db, runId, afterSeq);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[sse-stream] D1 read failed (run_id=${runId} after_seq=${afterSeq}): ${reason}`);
    await stream.writeSSE({ retry: RECONNECT_BACKOFF_MS, data: "" });
    return undefined;
  }
}

/**
 * Loads the case row, shielding the initial D1 read like the tail `safeFetch`.
 * Returns the row (or null if absent) on success, or `undefined` when a D1
 * error was handled (retry directive already sent) so the caller bails out.
 */
async function loadCaseRowSafe(
  db: ReturnType<typeof makeDb>,
  caseId: string,
  stream: StreamApi,
): Promise<Case | null | undefined> {
  try {
    return (await db.select().from(cases).where(eq(cases.id, caseId)).get()) ?? null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[sse-stream] D1 case read failed (case_id=${caseId}): ${reason}`);
    await stream.writeSSE({ retry: RECONNECT_BACKOFF_MS, data: "" });
    return undefined;
  }
}

async function streamCaseEvents(c: StreamContext, stream: StreamApi): Promise<void> {
  const caseId = c.req.param("id");
  if (!caseId) return;

  const db = makeDb(c.env.DB);
  const caseRow = await loadCaseRowSafe(db, caseId, stream);
  if (caseRow === undefined) return;
  if (!caseRow || caseRow.organization_id !== c.var.viewer.organizationId) {
    await stream.writeSSE({ retry: RECONNECT_BACKOFF_MS, data: "" });
    return;
  }
  if (!caseRow.current_run_id) {
    await stream.writeSSE({ retry: RECONNECT_BACKOFF_MS, data: "" });
    return;
  }

  const runId = caseRow.current_run_id;
  let lastSeen = parseLastEventId(c.req.header("Last-Event-ID"));
  const startedAt = Date.now();

  const catchUp = await safeFetch(db, runId, lastSeen, stream);
  if (catchUp === undefined) return;
  const catchUpResult = await emitRows(stream, catchUp, lastSeen);
  lastSeen = catchUpResult.lastSeen;
  if (catchUpResult.finished) return;
  if (TERMINAL_CASE_STATUSES.has(caseRow.status)) return;

  while (!c.req.raw.signal.aborted && Date.now() - startedAt < STREAM_WALL_CLOCK_MS) {
    await stream.sleep(LIVE_TAIL_INTERVAL_MS);
    if (c.req.raw.signal.aborted) return;
    const fresh = await safeFetch(db, runId, lastSeen, stream);
    if (fresh === undefined) return;
    const tailResult = await emitRows(stream, fresh, lastSeen);
    lastSeen = tailResult.lastSeen;
    if (tailResult.finished) return;
  }
}

export function caseStreamHandler(c: StreamContext): Response {
  return streamSSE(c, (stream) => streamCaseEvents(c, stream), onSseStreamError("case-stream"));
}
