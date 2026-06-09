import {
  VouchingChainEnvelopeSchema,
  assertCommunityVouchingCorroborated,
  assertPartnerOrgCorroborated,
  assertVouchingChain,
  type VouchingChain,
  type VouchingChainEnvelope,
} from "@mizan/shared";
import { createStep } from "@mastra/core/workflows";
import type { TracingContext } from "@mastra/core/observability";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { runStructuredLlm } from "../shared/runStructuredLlm.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import {
  PartialBriefStateSchema,
  type PartialBriefState,
} from "../../schemas/partial-brief-state.ts";
import { CLASSIFY_VOUCHING_SYSTEM, buildVouchingPayload } from "./prompt.ts";

/**
 * Minimum `vouching_narrative` length (post-trim) required to even
 * call the LLM for vouching classification. Below this threshold the
 * app deterministically emits `structure: "none"` — gating the LLM
 * call on a real application-side condition is more robust than
 * asking the LLM to count characters (LLMs hallucinate token-level
 * counts).
 */
const MIN_VOUCHING_NARRATIVE_CHARS = 20;

/**
 * Workflow step that classifies vouching-chain structure.
 *
 * Gating order:
 *   1. App-side narrative length check — short / missing
 *      `vouching_narrative` deterministically emits `structure: "none"`
 *      without spending a token (LLMs hallucinate character counts).
 *   2. LLM call emits `{ chain: <variant> }` — the envelope is
 *      required because cross-provider strict mode (OpenAI +
 *      Anthropic) rejects a bare `z.union` at the response root.
 *      `postProcess` unwraps so persisted state stores the variant
 *      directly under `signals.vouching` (no downstream-reader hop).
 *   3. Corroboration guards (`assertVouchingChain`,
 *      `assertPartnerOrgCorroborated`,
 *      `assertCommunityVouchingCorroborated`) reject LLM outputs
 *      whose structure cannot be grounded in the case's
 *      `vouching_narrative`. `minLength` is intentionally absent on
 *      `partner_org_name` because Anthropic strict mode rejects the
 *      keyword; the non-empty invariant is enforced application-side.
 */
export const classifyVouchingChain = createStep({
  id: "classifyVouchingChain",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal, tracingContext }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    abortSignal?.throwIfAborted();
    const caseRow = await loadCaseContext(env, inputData.caseId);
    abortSignal?.throwIfAborted();
    const payload = await classifyOrDefault({
      env,
      ctx,
      caseRow,
      inputData,
      abortSignal,
      tracingContext,
    });
    abortSignal?.throwIfAborted();
    await upsertSignal({
      env,
      caseId: inputData.caseId,
      runId: inputData.runId,
      signalType: "vouching_chain",
      payload,
    });
    return {
      ...inputData,
      signals: { ...inputData.signals, vouching: payload },
    };
  },
});

async function classifyOrDefault(args: {
  readonly env: ReturnType<typeof getEnv>;
  readonly ctx: ReturnType<typeof getCtx>;
  readonly caseRow: Awaited<ReturnType<typeof loadCaseContext>>;
  readonly inputData: PartialBriefState;
  readonly abortSignal: AbortSignal | undefined;
  readonly tracingContext?: TracingContext | undefined;
}): Promise<VouchingChain> {
  const narrative = (args.caseRow.vouching_narrative ?? "").trim();
  if (narrative.length < MIN_VOUCHING_NARRATIVE_CHARS) {
    return {
      structure: "none",
      weakest_link_narrative:
        "No supporters, references, or guarantors were named to vouch for this campaign, so there is no accountability chain to assess.",
    };
  }
  const envelope: VouchingChainEnvelope = await runStructuredLlm({
    env: args.env,
    ctx: args.ctx,
    stepName: "classifyVouchingChain",
    schemaName: "classifyVouchingChain.classify",
    modelKind: "extract",
    schema: VouchingChainEnvelopeSchema,
    system: CLASSIFY_VOUCHING_SYSTEM,
    userPayload: buildVouchingPayload(args.caseRow),
    abortSignal: args.abortSignal,
    tracingContext: args.tracingContext,
  });
  const corroborationSource = {
    story: args.caseRow.story,
    vouching_narrative: args.caseRow.vouching_narrative ?? null,
  };
  return assertCommunityVouchingCorroborated(
    assertPartnerOrgCorroborated(assertVouchingChain(envelope.chain), corroborationSource),
    corroborationSource,
  );
}
