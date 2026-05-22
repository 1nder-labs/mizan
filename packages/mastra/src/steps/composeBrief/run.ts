import { briefs, cases, eq, makeDb, and } from "@mizan/db";
import { generateObject } from "ai";
import {
  BriefPayloadSchema,
  PolicyCitationSchema,
  type BriefPayload,
  type PolicyCitation,
} from "../../schemas/brief.ts";
import type { PartialBriefState } from "../../schemas/brief.ts";
import type { CloudflareBindings } from "@mizan/worker/env";
import type { MizanRuntimeContext } from "../../observability/runtime-context.ts";
import { resolveLanguageModel } from "../../runtime/model-resolver.ts";
import { makeTelemetry } from "../../runtime/telemetry.ts";
import { applyCitationFilter, buildClauseIdSchema, buildPromptWithClauses } from "./helpers.ts";

interface ComposeContext {
  readonly env: CloudflareBindings;
  readonly ctx: MizanRuntimeContext;
  readonly inputData: PartialBriefState;
  readonly abortSignal: AbortSignal | undefined;
}

export function buildPerCallBriefSchema(availableClauseIds: readonly string[]) {
  const clauseIdSchema = buildClauseIdSchema(availableClauseIds);
  return BriefPayloadSchema.omit({ policy_citations: true }).extend({
    policy_citations: PolicyCitationSchema.omit({ clauseId: true })
      .extend({ clauseId: clauseIdSchema })
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
  const resolved = resolveLanguageModel({ env: composeContext.env, kind: "compose" });
  const basePayload = {
    caseId: composeContext.inputData.caseId,
    category: composeContext.ctx.category,
    geography: composeContext.ctx.geography,
    extractions: composeContext.inputData.extractions ?? {},
  };
  const generateArgs = {
    model: resolved.model,
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
      provider: resolved.config.provider,
      model: resolved.config.model,
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
  const insertStmt = db
    .insert(briefs)
    .values({
      case_id: caseId,
      run_id: runId,
      recommendation: brief.recommendation,
      confidence: brief.confidence,
      payload_json: brief,
    })
    .onConflictDoNothing({ target: [briefs.case_id, briefs.run_id] });
  const updateStmt = db
    .update(cases)
    .set({ status: "READY_FOR_REVIEW", updated_at: new Date() })
    .where(eq(cases.id, caseId));
  await db.batch([insertStmt, updateStmt]);
}

/** Updates an existing brief row after post-composeBrief mutations. */
export async function updatePersistedBrief(
  env: CloudflareBindings,
  caseId: string,
  runId: string,
  brief: BriefPayload,
): Promise<void> {
  const db = makeDb(env.DB);
  await db
    .update(briefs)
    .set({
      recommendation: brief.recommendation,
      confidence: brief.confidence,
      payload_json: brief,
    })
    .where(and(eq(briefs.case_id, caseId), eq(briefs.run_id, runId)));
}

export { type ComposeContext };
