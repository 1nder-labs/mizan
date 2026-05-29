import { zValidator } from "@hono/zod-validator";
import { lt } from "drizzle-orm";
import { and, desc, eq, makeDb, chat_messages, chat_threads } from "@mizan/db";
import {
  ChatThreadCreatedResponseSchema,
  ChatThreadListResponseSchema,
  ChatMessageRecordSchema,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import { extractViewer } from "../lib/viewer-context.ts";
import type { CloudflareBindings } from "../env.ts";
import { requireRole, type ViewerVariables } from "../middleware/require-role.ts";
import { handleChatPost } from "./chat-stream.ts";

const ChatPostSchema = z
  .object({
    threadId: z.string().uuid(),
    messages: z.array(z.object({ role: z.enum(["user", "assistant"]) }).passthrough()),
    context: z
      .object({
        route: z.string(),
        caseId: z.string().uuid().nullable(),
      })
      .strict(),
  })
  .strict();

export type ChatPostBody = z.infer<typeof ChatPostSchema>;

const ThreadCreateSchema = z.object({ title: z.string().optional() });

const ThreadsQuerySchema = z.object({
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

async function assertThreadOwner(
  db: ReturnType<typeof makeDb>,
  threadId: string,
  viewer: { userId: string; organizationId: string },
) {
  const row = await db
    .select({ user_id: chat_threads.user_id, organization_id: chat_threads.organization_id })
    .from(chat_threads)
    .where(eq(chat_threads.id, threadId))
    .get();
  if (!row) return { ok: false as const, status: 404 as const };
  if (row.user_id !== viewer.userId || row.organization_id !== viewer.organizationId) {
    return { ok: false as const, status: 403 as const };
  }
  return { ok: true as const };
}

export const chatRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .use("*", requireRole(["reviewer", "admin"]))
  .get("/threads", zValidator("query", ThreadsQuerySchema), async (c) => {
    const viewer = extractViewer(c);
    const query = c.req.valid("query");
    const db = makeDb(c.env.DB);
    const filters = [
      eq(chat_threads.user_id, viewer.userId),
      eq(chat_threads.organization_id, viewer.organizationId),
    ];
    if (query.cursor !== undefined) {
      filters.push(lt(chat_threads.updated_at, new Date(query.cursor)));
    }
    const rows = await db
      .select({
        id: chat_threads.id,
        title: chat_threads.title,
        updated_at: chat_threads.updated_at,
      })
      .from(chat_threads)
      .where(and(...filters))
      .orderBy(desc(chat_threads.updated_at))
      .limit(query.limit + 1)
      .all();
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return c.json(
      ChatThreadListResponseSchema.parse({
        threads: page.map((row) => ({
          id: row.id,
          title: row.title,
          updatedAt: row.updated_at.getTime(),
        })),
        nextCursor: hasMore && last ? last.updated_at.getTime() : null,
      }),
    );
  })
  .post("/threads", zValidator("json", ThreadCreateSchema), async (c) => {
    const viewer = extractViewer(c);
    const body = c.req.valid("json");
    const db = makeDb(c.env.DB);
    const now = new Date();
    const inserted = await db
      .insert(chat_threads)
      .values({
        user_id: viewer.userId,
        organization_id: viewer.organizationId,
        title: body.title ?? "New conversation",
        created_at: now,
        updated_at: now,
      })
      .returning({ id: chat_threads.id })
      .get();
    if (!inserted) return c.json({ error: "create_failed" }, 500);
    return c.json(ChatThreadCreatedResponseSchema.parse({ id: inserted.id }), 201);
  })
  .get("/threads/:id", async (c) => {
    const threadId = c.req.param("id");
    if (!threadId) return c.json({ error: "missing_id" }, 400);
    const viewer = extractViewer(c);
    const db = makeDb(c.env.DB);
    const owned = await assertThreadOwner(db, threadId, viewer);
    if (!owned.ok) return c.json({ error: "forbidden" }, owned.status);
    const rows = await db
      .select({
        id: chat_messages.id,
        role: chat_messages.role,
        parts_json: chat_messages.parts_json,
        created_at: chat_messages.created_at,
      })
      .from(chat_messages)
      .where(eq(chat_messages.thread_id, threadId))
      .orderBy(chat_messages.created_at)
      .all();
    const parsed = ChatMessageRecordSchema.array().safeParse(
      rows.map((row) => ({ id: row.id, role: row.role, parts: row.parts_json })),
    );
    if (!parsed.success) {
      return c.json({ error: "thread_schema_drift", threadId }, 422);
    }
    return c.json({ threadId, messages: parsed.data });
  })
  .post("/", zValidator("json", ChatPostSchema), async (c) => {
    const body = c.req.valid("json");
    const viewer = extractViewer(c);
    const db = makeDb(c.env.DB);
    const owned = await assertThreadOwner(db, body.threadId, viewer);
    if (!owned.ok) return c.json({ error: "forbidden" }, owned.status);
    return handleChatPost(c, body, viewer, db);
  });
