import { briefs, cases, eq, makeDb } from "@mizan/db";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel, type ModelConfig } from "../../models/factory.ts";
import { BriefPayloadSchema, type BriefPayload, type PolicyCitation } from "../../schemas/brief.ts";
import type { PartialBriefState } from "../../schemas/brief.ts";
import type { CloudflareBindings } from "@mizan/worker/env";
import type { MizanRuntimeContext } from "../../observability/runtime-context.ts";
import { makeTelemetry } from "../../runtime/telemetry.ts";
import { applyCitationFilter, buildClauseIdSchema, buildPromptWithClauses } from "./helpers.ts";

const COMPOSE_MODEL: ModelConfig = { provider: "anthropic", model: "claude-opus-4-7" };

interface ComposeContext {
  readonly env: CloudflareBindings;
  readonly ctx: MizanRuntimeContext;
  readonly inputData: PartialBriefState;
  readonly abortSignal: AbortSignal | undefined;
}

/** Builds the per-run schema that constrains citation clauseIds to matchPolicy output. */
export function buildPerCallBriefSchema(availableClauseIds: readonly string[]) {
  const clauseIdSchema = buildClauseIdSchema(availableClauseIds);
  return BriefPayloadSchema.omit({ policy_citations: true }).extend({
    policy_citations: z
      .object({
        clauseId: clauseIdSchema,
        source: z.enum(["zakat", "safety"]),
        excerpt: z.string(),
        relevance: z.number(),
      })
      .array(),
  });
}

/** Runs composeBrief LLM generation with the dynamic citation schema. */
export async function runComposeBriefGeneration(
  composeContext: ComposeContext,
  policyMatches: readonly PolicyCitation[],
): Promise<BriefPayload> {
  const availableClauseIds = policyMatches
    .map((match) => match.clauseId)
    .filter((id) => id.length > 0);
  const perCallSchema = buildPerCallBriefSchema(availableClauseIds);
  const basePayload = {
    caseId: composeContext.inputData.caseId,
    category: composeContext.ctx.category,
    geography: composeContext.ctx.geography,
    extractions: composeContext.inputData.extractions ?? {},
  };
  const generateArgs = {
    model: getModel(COMPOSE_MODEL, composeContext.env),
    schema: perCallSchema,
    schemaName: "composeBrief.compose",
    system:
      "Compose a reviewer brief from extracted evidence. Never approve — recommend next review action only. Every brief must cite at least two policy clauses from policy_matches when matches are available.",
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(buildPromptWithClauses(basePayload, policyMatches)),
          },
        ],
      },
    ],
    maxRetries: 2,
    experimental_telemetry: makeTelemetry({
      stepName: "composeBrief",
      callPurpose: "compose",
      runtimeContext: composeContext.ctx,
      provider: COMPOSE_MODEL.provider,
      model: COMPOSE_MODEL.model,
    }),
  };
  const { object } = await generateObject(
    composeContext.abortSignal
      ? { ...generateArgs, abortSignal: composeContext.abortSignal }
      : generateArgs,
  );
  const filtered = applyCitationFilter(object, new Set(availableClauseIds));
  return BriefPayloadSchema.parse(filtered);
}

/** Persists the composed brief and advances case status. */
export async function persistBrief(
  env: CloudflareBindings,
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

export { COMPOSE_MODEL, type ComposeContext };
