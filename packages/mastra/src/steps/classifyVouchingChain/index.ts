import { createStep } from "@mastra/core/workflows";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../../schemas/partial-brief-state.ts";
import {
  VouchingChainSchema,
  assertCommunityVouchingCorroborated,
  assertPartnerOrgCorroborated,
  assertVouchingChain,
} from "@mizan/shared";
import { runStructuredLlm } from "../shared/runStructuredLlm.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { CLASSIFY_VOUCHING_SYSTEM, buildVouchingPayload } from "./prompt.ts";

/**
 * Classifies vouching-chain structure via extractor-tier discriminated union output.
 *
 * Cross-provider strict-mode schemas (Anthropic + OpenAI) reject the
 * `minLength` keyword used to forbid empty `partner_org_name`; the guard
 * lives at the application layer via `assertVouchingChain` so a hallucinated
 * partner-org variant with an empty name cannot bypass forced-escalate.
 */
export const classifyVouchingChain = createStep({
  id: "classifyVouchingChain",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const raw = await runStructuredLlm({
      env,
      ctx,
      stepName: "classifyVouchingChain",
      schemaName: "classifyVouchingChain.classify",
      modelKind: "extract",
      schema: VouchingChainSchema,
      system: CLASSIFY_VOUCHING_SYSTEM,
      userPayload: buildVouchingPayload(caseRow),
      abortSignal,
    });
    const corroborationSource = {
      story: caseRow.story,
      vouching_narrative: caseRow.vouching_narrative ?? null,
    };
    const payload = assertCommunityVouchingCorroborated(
      assertPartnerOrgCorroborated(assertVouchingChain(raw), corroborationSource),
      corroborationSource,
    );
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
