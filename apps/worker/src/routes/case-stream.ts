/**
 * SSE stream of `workflow_events` for case resumability.
 */
import { and, eq, gt, makeDb, workflow_events, cases } from "@mizan/db";
import { toWorkflowEventWire } from "@mizan/shared";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { CloudflareBindings } from "../env.ts";
import type { ProducerVariables } from "../middleware/producer-guard.ts";
import type { RoleVariables } from "../middleware/require-role.ts";

const LIVE_TAIL_INTERVAL_MS = 500;
const STREAM_WALL_CLOCK_MS = 90_000;

type StreamContext = Context<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables & RoleVariables;
}>;

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

async function writeEventRow(
  stream: { writeSSE: (payload: { id: string; event: string; data: string }) => Promise<void> },
  row: WorkflowEventRow,
): Promise<void> {
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
  stream: { writeSSE: (payload: { id: string; event: string; data: string }) => Promise<void> },
  rows: WorkflowEventRow[],
): Promise<{ finished: boolean; lastSeen: number }> {
  let lastSeen = 0;
  for (const row of rows) {
    await writeEventRow(stream, row);
    lastSeen = row.seq;
    if (row.event_type === "workflow.finish") {
      return { finished: true, lastSeen };
    }
  }
  return { finished: false, lastSeen };
}

async function streamCaseEvents(
  c: StreamContext,
  stream: {
    writeSSE: (payload: { id: string; event: string; data: string }) => Promise<void>;
    sleep: (ms: number) => Promise<unknown>;
  },
): Promise<void> {
  const caseId = c.req.param("id");
  if (!caseId) return;

  const db = makeDb(c.env.DB);
  const caseRow = await db.select().from(cases).where(eq(cases.id, caseId)).get();
  if (!caseRow?.current_run_id) return;

  const runId = caseRow.current_run_id;
  let lastSeen = parseLastEventId(c.req.header("Last-Event-ID"));
  const startedAt = Date.now();

  const catchUp = await fetchEventsAfterSeq(db, runId, lastSeen);
  const catchUpResult = await emitRows(stream, catchUp);
  lastSeen = catchUpResult.lastSeen;
  if (catchUpResult.finished) return;

  while (!c.req.raw.signal.aborted && Date.now() - startedAt < STREAM_WALL_CLOCK_MS) {
    await stream.sleep(LIVE_TAIL_INTERVAL_MS);
    if (c.req.raw.signal.aborted) return;
    const fresh = await fetchEventsAfterSeq(db, runId, lastSeen);
    const tailResult = await emitRows(stream, fresh);
    lastSeen = tailResult.lastSeen;
    if (tailResult.finished) return;
  }
}

/** Factory for the case SSE handler mounted on `caseRoutes`. */
export function createCaseStreamHandler(): (c: StreamContext) => Response | Promise<Response> {
  return (c) => {
    const caseId = c.req.param("id");
    if (!caseId) return c.json({ error: "case id missing" }, 400);
    return streamSSE(c, (stream) => streamCaseEvents(c, stream));
  };
}
