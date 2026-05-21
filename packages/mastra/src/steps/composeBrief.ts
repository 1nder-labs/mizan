import { createStep } from "@mastra/core/workflows";
import { briefs, cases, eq, makeDb } from "@mizan/db";
import { clampInt } from "@mizan/shared";
import { generateObject } from "ai";
import { getModel, type ModelConfig } from "../models/factory.ts";
import {
  BriefPayloadSchema,
  PartialBriefStateSchema,
  type BriefPayload,
} from "../schemas/brief.ts";
import { getCtx, getEnv } from "../runtime/context-accessors.ts";
import { makeTelemetry } from "../runtime/telemetry.ts";

const COMPOSE_MODEL: ModelConfig = { provider: "anthropic", model: "claude-opus-4-7" };

/** Reasoning step — composes BriefPayload and persists to D1. */
export const composeBrief = createStep({
  id: "composeBrief",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const schemaName = "composeBrief.compose";
    const { object } = await generateObject({
      model: getModel(COMPOSE_MODEL, env),
      schema: BriefPayloadSchema,
      schemaName,
      system:
        "Compose a reviewer brief from extracted evidence. Never approve — recommend next review action only.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                caseId: inputData.caseId,
                category: ctx.category,
                geography: ctx.geography,
                extractions: inputData.extractions ?? {},
              }),
            },
          ],
        },
      ],
      abortSignal,
      maxRetries: 2,
      experimental_telemetry: makeTelemetry({
        stepName: "composeBrief",
        callPurpose: "compose",
        runtimeContext: ctx,
        provider: COMPOSE_MODEL.provider,
        model: COMPOSE_MODEL.model,
      }),
    });
    const composed = normalizeBrief(object);
    await persistBrief(env, inputData.caseId, inputData.runId, composed);
    return { ...inputData, brief: composed };
  },
});

function normalizeBrief(payload: BriefPayload): BriefPayload {
  return {
    ...payload,
    confidence: clampInt(payload.confidence, 0, 100),
  };
}

async function persistBrief(
  env: Parameters<typeof getModel>[1],
  caseId: string,
  runId: string,
  brief: BriefPayload,
): Promise<void> {
  const db = makeDb(env.DB);
  await db
    .insert(briefs)
    .values({
      case_id: caseId,
      run_id: runId,
      recommendation: brief.recommendation,
      confidence: brief.confidence,
      payload_json: brief,
    })
    .onConflictDoNothing();
  await db
    .update(cases)
    .set({ status: "READY_FOR_REVIEW", updated_at: new Date() })
    .where(eq(cases.id, caseId));
}
