/**
 * Case routes mounted at `/api/cases`.
 *
 * Middleware order on `POST /:id/brief`:
 * 1. requireRole(["reviewer", "admin"])
 * 2. idempotencyKey (Layer 1 HTTP replay)
 * 3. producerGuard (Layer 2 workflow dedup)
 */

import {
  createMastra,
  flushLangfuse,
  makeRuntimeContext,
  MIZAN_CTX_KEY,
  MIZAN_ENV_KEY,
  type MizanRuntimeContext,
} from "@mizan/mastra";
import { toAISdkStream } from "@mastra/ai-sdk";
import { cases, eq, makeDb, type Case } from "@mizan/db";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";
import type { CloudflareBindings } from "../env.ts";
import { idempotencyKey } from "../middleware/idempotency-key.ts";
import { producerGuard, type ProducerVariables } from "../middleware/producer-guard.ts";
import { requireRole } from "../middleware/require-role.ts";

type BriefContext = Context<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>;

function buildMizanContext(
  c: BriefContext,
  caseId: string,
  runId: string,
  caseRow: Case,
): MizanRuntimeContext {
  return {
    caseId,
    runId,
    reviewerId: c.var.user.id,
    sessionId: null,
    category: caseRow.category,
    geography: caseRow.geography,
    langfuseEnabled: Boolean(c.env.LANGFUSE_PUBLIC_KEY && c.env.LANGFUSE_SECRET_KEY),
  };
}

async function streamBriefResponse(
  c: BriefContext,
  caseId: string,
  runId: string,
  caseRow: Case,
): Promise<Response> {
  const { mastra, langfuse } = createMastra(c.env);
  const workflow = mastra.getWorkflow("brief");
  const run = await workflow.createRun({ runId });
  const ctx = buildMizanContext(c, caseId, runId, caseRow);
  const requestContext = makeRuntimeContext(ctx);
  requestContext.set(MIZAN_ENV_KEY, c.env);
  requestContext.set(MIZAN_CTX_KEY, ctx);

  const onAbort = (): void => {
    void run.cancel();
  };
  c.req.raw.signal.addEventListener("abort", onAbort);

  try {
    const workflowStream = run.stream({ inputData: { caseId, runId }, requestContext });
    const aiSdkStream = toAISdkStream(workflowStream, { from: "workflow", version: "v6" });
    const uiStream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.merge(aiSdkStream);
      },
    });
    flushLangfuse(langfuse, c.executionCtx);
    return createUIMessageStreamResponse({ stream: uiStream });
  } finally {
    c.req.raw.signal.removeEventListener("abort", onAbort);
    if (c.req.raw.signal.aborted) {
      await restoreDraft(c.env, caseId);
    }
  }
}

/**
 * Pre-stream POST handler for `/api/cases/:id/brief`. Errors thrown
 * before SSE headers go out are caught here, the case is restored to
 * DRAFT, and the response is redacted to a stable error envelope —
 * the underlying message stays in worker logs (Cloudflare observability
 * captures the throw) so on-call sees the failure without leaking
 * workflow internals to the reviewer. Mid-stream failures take the
 * SSE error-event path instead and never reach this catch.
 */
async function handleBriefPost(c: BriefContext): Promise<Response> {
  const caseId = c.req.param("id");
  if (!caseId) return c.json({ error: "case id missing" }, 400);
  const runId = c.get("runId");
  const caseRow = c.get("caseRow");
  try {
    return await streamBriefResponse(c, caseId, runId, caseRow);
  } catch (error) {
    await restoreDraft(c.env, caseId);
    console.error(
      `[brief] workflow failed (case_id=${caseId} run_id=${runId}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return c.json({ error: "workflow_failed", case_id: caseId, run_id: runId }, 500);
  }
}

export const caseRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>()
  .use("*", requireRole(["reviewer", "admin"]))
  .post("/:id/brief", idempotencyKey, producerGuard, handleBriefPost);

async function restoreDraft(env: CloudflareBindings, caseId: string): Promise<void> {
  const db = makeDb(env.DB);
  await db
    .update(cases)
    .set({ status: "DRAFT", updated_at: new Date() })
    .where(eq(cases.id, caseId));
}
