import { toAISdkStream } from "@mastra/ai-sdk";
import { createReviewerCopilotAgent, RequestContext } from "@mizan/mastra";
import { eq, chat_messages, chat_threads, type Db } from "@mizan/db";
import type { ViewerContext } from "@mizan/shared";
import { createUIMessageStream, createUIMessageStreamResponse, validateUIMessages } from "ai";
import type { Context } from "hono";
import type { CloudflareBindings } from "../env.ts";
import { buildCopilotTools } from "../agents/copilot-tools.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";
import type { ChatPostBody } from "./chat.ts";

function buildChatRequestContext(
  viewer: ViewerContext,
  db: Db,
  context: ChatPostBody["context"],
): RequestContext {
  const requestContext = new RequestContext();
  requestContext.set("viewer", viewer);
  requestContext.set("db", db);
  requestContext.set("route", context.route);
  if (context.caseId) {
    requestContext.set("caseId", context.caseId);
  }
  return requestContext;
}

async function persistLatestUserMessage(
  db: Db,
  threadId: string,
  messages: ChatPostBody["messages"],
) {
  const validated = await validateUIMessages({ messages });
  const lastUser = [...validated].reverse().find((message) => message.role === "user");
  if (!lastUser) return validated;
  await db.insert(chat_messages).values({
    thread_id: threadId,
    role: "user",
    parts_json: lastUser.parts,
    created_at: new Date(),
  });
  return validated;
}

/** Handles `POST /api/chat` streaming for an owned thread. */
export async function handleChatPost(
  c: Context<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>,
  body: ChatPostBody,
  viewer: ViewerContext,
  db: Db,
): Promise<Response> {
  const validated = await persistLatestUserMessage(db, body.threadId, body.messages);
  const tools = buildCopilotTools(c.env, viewer.role);
  const agent = createReviewerCopilotAgent(c.env, tools);
  const requestContext = buildChatRequestContext(viewer, db, body.context);

  try {
    const agentStream = await agent.stream(validated, {
      requestContext,
      abortSignal: c.req.raw.signal,
    });
    const aiSdkStream = toAISdkStream(agentStream, { from: "agent", version: "v6" });
    const uiStream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.merge(aiSdkStream);
      },
      onFinish: async ({ responseMessage }) => {
        try {
          await db.insert(chat_messages).values({
            thread_id: body.threadId,
            role: "assistant",
            parts_json: responseMessage.parts,
            created_at: new Date(),
          });
          await db
            .update(chat_threads)
            .set({ updated_at: new Date() })
            .where(eq(chat_threads.id, body.threadId));
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`[chat] onFinish persist failed (thread=${body.threadId}): ${reason}`);
        }
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[chat] stream failed (thread=${body.threadId}): ${reason}`);
    return c.json({ error: "chat_stream_failed" }, 500);
  }
}
