/**
 * Org-wide live event SSE stream at `GET /api/events/stream?topic=...`.
 */
import { and, eq, gt, live_events, makeDb, cases, sql } from "@mizan/db";
import { LiveEventRowSchema } from "@mizan/shared";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { requireRole, type ViewerVariables } from "../middleware/require-role.ts";
import {
  LIVE_TAIL_INTERVAL_MS,
  onSseStreamError,
  RECONNECT_BACKOFF_MS,
  STREAM_WALL_CLOCK_MS,
} from "./sse-constants.ts";

const TopicQuerySchema = z.object({ topic: z.string().min(1) });
const TopicPattern = /^(org|user|case):(.+)$/;

type StreamContext = Context<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
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

function parseLastEventId(header: string | undefined): number {
  if (!header) return 0;
  const parsed = Number.parseInt(header, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function authorizeTopic(
  c: StreamContext,
  topic: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 403 }> {
  const match = TopicPattern.exec(topic);
  if (!match) return { ok: false, status: 400 };
  const kind = match[1];
  const id = match[2];
  if (!kind || !id) return { ok: false, status: 400 };
  const viewer = c.var.viewer;
  if (viewer.role === "client") {
    return kind === "user" && id === viewer.userId ? { ok: true } : { ok: false, status: 403 };
  }
  if (kind === "org" && id !== viewer.organizationId) return { ok: false, status: 403 };
  if (kind === "user" && id !== viewer.userId) return { ok: false, status: 403 };
  if (kind === "case") {
    const db = makeDb(c.env.DB);
    const row = await db
      .select({ organization_id: cases.organization_id, assigned_to: cases.assigned_to })
      .from(cases)
      .where(eq(cases.id, id))
      .get();
    if (!row || row.organization_id !== viewer.organizationId) return { ok: false, status: 403 };
    if (viewer.role !== "admin" && row.assigned_to !== viewer.userId) {
      return { ok: false, status: 403 };
    }
  }
  return { ok: true };
}

type StreamViewer = StreamContext["var"]["viewer"];

/**
 * Whether the viewer's events must be scoped to cases assigned to them. The
 * `org:` topic fans EVERY case's events to every org member, and the `case:`
 * subscribe-time check goes stale on mid-stream reassignment — so a non-admin on
 * either topic must have each event re-checked against live assignment. Admins
 * see all cases; `user:` topics are already self-scoped (and carry non-case
 * events like `notification.new`), so neither is scoped.
 */
function scopesByAssignment(viewer: StreamViewer, topic: string): boolean {
  if (viewer.role === "admin") return false;
  return topic.startsWith("org:") || topic.startsWith("case:");
}

/**
 * Reads the tape after `afterSeq`, computing per-row authorization IN the query:
 * when the viewer is assignment-scoped, a LEFT JOIN on the payload's `case_id`
 * resolves the case's current `assigned_to`, and `authorized` is 1 only when it
 * matches the viewer. One query — no second assignment lookup, no JSON
 * duck-typing in JS — and every row (authorized or not) is still returned so the
 * caller can advance the cursor past dropped rows. `case_id`-less rows on a
 * non-scoped topic stay authorized; on a scoped topic they have no producer.
 */
export async function fetchEventsAfterSeq(
  db: ReturnType<typeof makeDb>,
  viewer: StreamViewer,
  topic: string,
  afterSeq: number,
) {
  const authorized = scopesByAssignment(viewer, topic)
    ? sql<number>`CASE WHEN ${cases.assigned_to} = ${viewer.userId} THEN 1 ELSE 0 END`
    : sql<number>`1`;
  return db
    .select({
      topic: live_events.topic,
      seq: live_events.seq,
      event_type: live_events.event_type,
      payload_json: live_events.payload_json,
      emitted_at: live_events.emitted_at,
      actor_user_id: live_events.actor_user_id,
      organization_id: live_events.organization_id,
      authorized,
    })
    .from(live_events)
    .leftJoin(cases, sql`${cases.id} = json_extract(${live_events.payload_json}, '$.case_id')`)
    .where(and(eq(live_events.topic, topic), gt(live_events.seq, afterSeq)))
    .orderBy(live_events.seq)
    .all();
}

/**
 * Wraps the tape read so a transient D1 failure backs the client off with a
 * `retry:` directive instead of killing the stream. Mirrors the per-case
 * stream's `safeFetch` (`case-stream.ts`) so both SSE surfaces degrade the
 * same way.
 */
async function safeFetch(
  db: ReturnType<typeof makeDb>,
  viewer: StreamViewer,
  topic: string,
  afterSeq: number,
  stream: StreamApi,
): Promise<Awaited<ReturnType<typeof fetchEventsAfterSeq>> | undefined> {
  try {
    return await fetchEventsAfterSeq(db, viewer, topic, afterSeq);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[events-stream] D1 read failed (topic=${topic} after_seq=${afterSeq}): ${reason}`,
    );
    await stream.writeSSE({ retry: RECONNECT_BACKOFF_MS, data: "" });
    return undefined;
  }
}

async function writeLiveRow(
  stream: StreamApi,
  row: Awaited<ReturnType<typeof fetchEventsAfterSeq>>[number],
) {
  const wire = LiveEventRowSchema.safeParse({
    topic: row.topic,
    seq: row.seq,
    event_type: row.event_type,
    payload: row.payload_json,
    emitted_at: row.emitted_at.getTime(),
    actor_user_id: row.actor_user_id,
    organization_id: row.organization_id,
  });
  if (!wire.success) {
    console.error(`[events-stream] schema drift (topic=${row.topic} seq=${row.seq})`);
    return;
  }
  await stream.writeSSE({
    id: String(row.seq),
    event: row.event_type,
    data: JSON.stringify(wire.data),
  });
}

/**
 * Writes a fetched batch, skipping rows the fetch marked unauthorized (`authorized
 * = 0`), and returns the new high-water seq. `lastSeen` advances past skipped
 * rows too, so a dropped event is never re-fetched and the cursor can't stall on
 * a high-seq event for an unassigned case.
 */
async function writeAuthorizedBatch(
  stream: StreamApi,
  batch: Awaited<ReturnType<typeof fetchEventsAfterSeq>>,
  lastSeen: number,
): Promise<number> {
  let last = lastSeen;
  for (const row of batch) {
    if (row.authorized === 1) await writeLiveRow(stream, row);
    last = row.seq;
  }
  return last;
}

/** Streams events for a topic already authorized by the route handler. */
async function streamTopicEvents(
  c: StreamContext,
  stream: StreamApi,
  topic: string,
): Promise<void> {
  const db = makeDb(c.env.DB);
  const viewer = c.var.viewer;
  let lastSeen = parseLastEventId(c.req.header("Last-Event-ID"));
  const startedAt = Date.now();

  const catchUp = await safeFetch(db, viewer, topic, lastSeen, stream);
  if (catchUp === undefined) return;
  lastSeen = await writeAuthorizedBatch(stream, catchUp, lastSeen);

  while (!c.req.raw.signal.aborted && Date.now() - startedAt < STREAM_WALL_CLOCK_MS) {
    await stream.sleep(LIVE_TAIL_INTERVAL_MS);
    if (c.req.raw.signal.aborted) return;
    const fresh = await safeFetch(db, viewer, topic, lastSeen, stream);
    if (fresh === undefined) return;
    lastSeen = await writeAuthorizedBatch(stream, fresh, lastSeen);
  }
}

export const eventsStreamRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .use("*", requireRole(["reviewer", "admin", "client"]))
  .get("/stream", zValidator("query", TopicQuerySchema), async (c) => {
    const { topic } = c.req.valid("query");
    const authz = await authorizeTopic(c, topic);
    if (!authz.ok) {
      return c.json({ error: authz.status === 400 ? "invalid_topic" : "forbidden" }, authz.status);
    }
    return streamSSE(
      c,
      (stream) => streamTopicEvents(c, stream, topic),
      onSseStreamError("events-stream"),
    );
  });
