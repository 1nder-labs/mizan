/**
 * Org-wide live event SSE stream at `GET /api/events/stream?topic=...`.
 */
import { and, eq, gt, live_events, makeDb, cases } from "@mizan/db";
import { LiveEventRowSchema } from "@mizan/shared";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { requireRole, type ViewerVariables } from "../middleware/require-role.ts";

const LIVE_TAIL_INTERVAL_MS = 500;
const STREAM_WALL_CLOCK_MS = 90_000;
const RECONNECT_BACKOFF_MS = 5_000;

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
  if (kind === "org" && id !== viewer.organizationId) return { ok: false, status: 403 };
  if (kind === "user" && id !== viewer.userId) return { ok: false, status: 403 };
  if (kind === "case") {
    const db = makeDb(c.env.DB);
    const row = await db
      .select({ organization_id: cases.organization_id })
      .from(cases)
      .where(eq(cases.id, id))
      .get();
    if (!row || row.organization_id !== viewer.organizationId) return { ok: false, status: 403 };
  }
  return { ok: true };
}

async function fetchEventsAfterSeq(db: ReturnType<typeof makeDb>, topic: string, afterSeq: number) {
  return db
    .select()
    .from(live_events)
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
  topic: string,
  afterSeq: number,
  stream: StreamApi,
): Promise<Awaited<ReturnType<typeof fetchEventsAfterSeq>> | undefined> {
  try {
    return await fetchEventsAfterSeq(db, topic, afterSeq);
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

/** Streams events for a topic already authorized by the route handler. */
async function streamTopicEvents(
  c: StreamContext,
  stream: StreamApi,
  topic: string,
): Promise<void> {
  const db = makeDb(c.env.DB);
  let lastSeen = parseLastEventId(c.req.header("Last-Event-ID"));
  const startedAt = Date.now();

  const catchUp = await safeFetch(db, topic, lastSeen, stream);
  if (catchUp === undefined) return;
  for (const row of catchUp) {
    await writeLiveRow(stream, row);
    lastSeen = row.seq;
  }

  while (!c.req.raw.signal.aborted && Date.now() - startedAt < STREAM_WALL_CLOCK_MS) {
    await stream.sleep(LIVE_TAIL_INTERVAL_MS);
    if (c.req.raw.signal.aborted) return;
    const fresh = await safeFetch(db, topic, lastSeen, stream);
    if (fresh === undefined) return;
    for (const row of fresh) {
      await writeLiveRow(stream, row);
      lastSeen = row.seq;
    }
  }
}

export const eventsStreamRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .use("*", requireRole(["reviewer", "admin"]))
  .get("/stream", zValidator("query", TopicQuerySchema), async (c) => {
    const { topic } = c.req.valid("query");
    const authz = await authorizeTopic(c, topic);
    if (!authz.ok) {
      return c.json({ error: authz.status === 400 ? "invalid_topic" : "forbidden" }, authz.status);
    }
    return streamSSE(c, (stream) => streamTopicEvents(c, stream, topic));
  });
