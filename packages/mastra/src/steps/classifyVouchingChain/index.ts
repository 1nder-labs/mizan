import {
  VouchingChainEnvelopeSchema,
  assertCommunityVouchingCorroborated,
  assertPartnerOrgCorroborated,
  assertVouchingChain,
  type VouchingChain,
  type VouchingChainEnvelope,
} from "@mizan/shared";
import { createStep } from "@mastra/core/workflows";
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
 * Classifies vouching-chain structure via an envelope-wrapped tagged
 * union.
 *
 * The LLM emits `{ chain: <variant> }` because cross-provider strict
 * mode (OpenAI + Anthropic) requires `type: "object"` at the response
 * root — a bare `z.union` of object variants violates that. The
 * envelope is unwrapped in `postProcess` before the corroboration
 * guards run, so persisted state still stores the variant directly
 * under `signals.vouching` (no extra hop for downstream readers).
 *
 * `minLength` is intentionally absent on `partner_org_name` (Anthropic
 * strict mode rejects the keyword); `assertVouchingChain` enforces the
 * non-empty invariant. `assertPartnerOrgCorroborated` and
 * `assertCommunityVouchingCorroborated` reject LLM outputs whose
 * structure cannot be grounded in the case's `vouching_narrative`.
 */
/**
 * Workflow step. Gates the LLM call on an app-side narrative length
 * check — short / missing `vouching_narrative` deterministically
 * emits `structure: "none"` without spending a token. When the
 * narrative IS long enough, the LLM emits an envelope-wrapped
 * variant (cross-provider strict mode), and the corroboration guards
 * reject hallucinated institutional / community claims.
 */
export const classifyVouchingChain = createStep({
  id: "classifyVouchingChain",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    abortSignal?.throwIfAborted();
    const caseRow = await loadCaseContext(env, inputData.caseId);
    abortSignal?.throwIfAborted();
    const payload = await classifyOrDefault({ env, ctx, caseRow, inputData, abortSignal });
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
}): Promise<VouchingChain> {
  const narrative = (args.caseRow.vouching_narrative ?? "").trim();
  if (narrative.length < MIN_VOUCHING_NARRATIVE_CHARS) {
    return {
      structure: "none",
      weakest_link_narrative:
        "no vouching narrative provided — defaulted to `none` by app-side gate",
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
