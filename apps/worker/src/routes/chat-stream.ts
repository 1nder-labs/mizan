import { toAISdkStream } from "@mastra/ai-sdk";
import {
  createReviewerCopilotAgent,
  createMastra,
  flushLangfuse,
  type CopilotRole,
  CHAT_CONTEXT_KEYS,
  RequestContext,
} from "@mizan/mastra";
import type { LangfuseExporter } from "@mizan/mastra";
import { eq, chat_messages, chat_threads, type Db } from "@mizan/db";
import type { ViewerContext } from "@mizan/shared";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  validateUIMessages,
  type UIMessage,
} from "ai";
import type { ExecutionContext } from "@cloudflare/workers-types";
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
  requestContext.set(CHAT_CONTEXT_KEYS.route, context.route);
  if (context.caseId) {
    requestContext.set(CHAT_CONTEXT_KEYS.caseId, context.caseId);
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

function registerCopilotAgent(env: CloudflareBindings, viewerRole: CopilotRole) {
  const tools = buildCopilotTools(env, viewerRole);
  const copilotAgent = createReviewerCopilotAgent(env, tools);
  return createMastra(env, { agents: { reviewerCopilot: copilotAgent } });
}

function buildOnFinishHandler(
  db: Db,
  threadId: string,
  langfuse: LangfuseExporter | null,
  executionCtx: ExecutionContext,
) {
  return async ({ responseMessage }: { responseMessage: UIMessage }) => {
    try {
      await db.insert(chat_messages).values({
        thread_id: threadId,
        role: "assistant",
        parts_json: responseMessage.parts,
        created_at: new Date(),
      });
      await db
        .update(chat_threads)
        .set({ updated_at: new Date() })
        .where(eq(chat_threads.id, threadId));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[chat] onFinish persist failed (thread=${threadId}): ${reason}`);
    }
    flushLangfuse(langfuse, executionCtx);
  };
}

/** Handles `POST /api/chat` streaming for an owned thread. */
export async function handleChatPost(
  c: Context<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>,
  body: ChatPostBody,
  viewer: ViewerContext,
  db: Db,
  executionCtx: ExecutionContext,
): Promise<Response> {
  const validated = await persistLatestUserMessage(db, body.threadId, body.messages);
  const { mastra, langfuse } = registerCopilotAgent(c.env, viewer.role);
  const agent = mastra.getAgent("reviewerCopilot");
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
      onFinish: buildOnFinishHandler(db, body.threadId, langfuse, executionCtx),
    });
    return createUIMessageStreamResponse({ stream: uiStream });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[chat] stream failed (thread=${body.threadId}): ${reason}`);
    flushLangfuse(langfuse, executionCtx);
    return c.json({ error: "chat_stream_failed" }, 500);
  }
}
