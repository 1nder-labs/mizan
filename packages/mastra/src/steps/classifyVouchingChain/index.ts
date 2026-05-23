import {
  VouchingChainSchema,
  assertCommunityVouchingCorroborated,
  assertPartnerOrgCorroborated,
  assertVouchingChain,
  type VouchingChain,
} from "@mizan/shared";
import { makeLlmSignalStep } from "../shared/makeLlmSignalStep.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { CLASSIFY_VOUCHING_SYSTEM, buildVouchingPayload } from "./prompt.ts";

/**
 * Classifies vouching-chain structure via extractor-tier discriminated union output.
 *
 * Cross-provider strict-mode schemas (Anthropic + OpenAI) reject the
 * `minLength` keyword used to forbid empty `partner_org_name`; the guard
 * lives at the application layer via `assertVouchingChain` so a hallucinated
 * partner-org variant with an empty name cannot bypass forced-escalate.
 *
 * Partner-org and community corroboration are also application-layer
 * guards — they reject LLM outputs where the structure does not match
 * the case's `story` / `vouching_narrative`. Wired through the LLM
 * signal-step factory; this file declares only the slot-specific pieces.
 */
export const classifyVouchingChain = makeLlmSignalStep<VouchingChain>({
  id: "classifyVouchingChain",
  schemaName: "classifyVouchingChain.classify",
  modelKind: "extract",
  schema: VouchingChainSchema,
  system: CLASSIFY_VOUCHING_SYSTEM,
  buildUserPayload: ({ caseRow }) => buildVouchingPayload(caseRow),
  postProcess: ({ raw, caseRow }) => {
    const corroborationSource = {
      story: caseRow.story,
      vouching_narrative: caseRow.vouching_narrative ?? null,
    };
    return assertCommunityVouchingCorroborated(
      assertPartnerOrgCorroborated(assertVouchingChain(raw), corroborationSource),
      corroborationSource,
    );
  },
  persist: ({ env, caseId, runId, payload }) =>
    upsertSignal({ env, caseId, runId, signalType: "vouching_chain", payload }),
  mergeIntoState: (state, payload) => ({
    ...state,
    signals: { ...state.signals, vouching: payload },
  }),
});
