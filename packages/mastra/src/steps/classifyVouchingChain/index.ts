import { createStep } from "@mastra/core/workflows";
import { generateObject } from "ai";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { resolveLanguageModel } from "../../runtime/model-resolver.ts";
import { makeTelemetry } from "../../runtime/telemetry.ts";
import { PartialBriefStateSchema } from "../../schemas/brief.ts";
import { VouchingChainSchema, assertVouchingChain } from "../../schemas/vouching.ts";
import { wrapUntrustedData } from "../shared/untrusted-data.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { buildVouchingGenerateArgs, type VouchingPromptContext } from "./prompt.ts";

/**
 * Classifies vouching-chain structure via extractor-tier discriminated union output.
 *
 * Organizer-supplied fields pass through `wrapUntrustedData` so the LLM is
 * told to treat them as inert data, never as instructions. This blocks a
 * prompt-injection bypass where an adversarial story could otherwise coerce
 * the classifier into emitting an institutional-vouching variant for an
 * OFAC-geography case. Post-parse `assertVouchingChain` guards the schema's
 * non-empty `partner_org_name` invariant at the application layer (Anthropic
 * structured-output mode rejects `minLength` keyword in the schema itself).
 */
export const classifyVouchingChain = createStep({
  id: "classifyVouchingChain",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const resolved = resolveLanguageModel({ env, kind: "extract" });
    const promptContext: VouchingPromptContext = {
      story: caseRow.story,
      vouching_narrative: caseRow.vouching_narrative ?? null,
      organizer_name: caseRow.organizer_name,
      geography: caseRow.geography,
    };
    const generateArgs = buildVouchingGenerateArgs({
      model: resolved.model,
      schema: VouchingChainSchema,
      untrustedPayload: wrapUntrustedData(promptContext),
      telemetry: makeTelemetry({
        stepName: "classifyVouchingChain",
        callPurpose: "extract",
        runtimeContext: ctx,
        provider: resolved.config.provider,
        model: resolved.config.model,
      }),
    });
    const { object: raw } = await generateObject(
      abortSignal ? { ...generateArgs, abortSignal } : generateArgs,
    );
    const payload = assertVouchingChain(raw);
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
