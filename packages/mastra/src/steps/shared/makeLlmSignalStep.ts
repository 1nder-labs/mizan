import { createStep } from "@mastra/core/workflows";
import type { z } from "zod";
import type { CloudflareBindings } from "@mizan/shared";
import type { ModelKind } from "../../models/factory.ts";
import { loadCaseContext, type CaseContext } from "../../runtime/case-loader.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import {
  PartialBriefStateSchema,
  type PartialBriefState,
} from "../../schemas/partial-brief-state.ts";
import { runStructuredLlm } from "./runStructuredLlm.ts";

/**
 * Shape every LLM-emitting trust-signal step needs.
 *
 * The factory below collapses the load-case → call-LLM → post-process →
 * upsert-signal → merge-into-state skeleton shared by `storyCoherence`
 * and `classifyVouchingChain` (and any future Mode-B LLM signal). Each
 * step supplies only the slot-specific pieces: prompt assembly,
 * post-parse normalisation, the typed persist closure (a thin alias
 * around `upsertSignal` so the discriminated `signalType ↔ payload`
 * union stays type-checked), and the state-slot writer.
 *
 * Photo signals are deterministic (no LLM) and so stay outside this
 * factory — pulling them in would force the factory to model a
 * zero-LLM variant for negligible code reuse.
 */
export interface LlmSignalStepDef<TWire, TPayload = TWire> {
  readonly id: string;
  readonly schemaName: string;
  readonly modelKind: ModelKind;
  /**
   * LLM-output schema. Cross-provider strict mode (OpenAI + Anthropic
   * 2026-04-30) requires `type: "object"` at the root, so steps whose
   * canonical payload is a tagged union wrap it in an envelope schema
   * (e.g. `{ chain: <variant> }`) and unwrap in `postProcess`.
   */
  readonly schema: z.ZodType<TWire>;
  readonly system: string;
  readonly buildUserPayload: (args: {
    readonly caseRow: CaseContext;
    readonly inputData: PartialBriefState;
  }) => string;
  /**
   * Normalises the LLM-wire shape into the canonical persisted
   * payload. Most steps return the raw shape unchanged (TWire =
   * TPayload); envelope-wrapped variants unwrap here.
   */
  readonly postProcess: (args: {
    readonly raw: TWire;
    readonly caseRow: CaseContext;
    readonly inputData: PartialBriefState;
  }) => TPayload;
  readonly persist: (args: {
    readonly env: CloudflareBindings;
    readonly caseId: string;
    readonly runId: string;
    readonly payload: TPayload;
  }) => Promise<void>;
  readonly mergeIntoState: (state: PartialBriefState, payload: TPayload) => PartialBriefState;
}

/**
 * Builds a Mastra step from an LLM-signal definition.
 *
 * `abortSignal.throwIfAborted()` runs at every boundary the LLM SDK
 * cannot itself intercept (before loadCaseContext, after the LLM
 * completes, before the upsert). `generateText` forwards the same
 * signal to the underlying provider, so an abort raised mid-LLM bubbles
 * up there; the extra checkpoints close the windows around the LLM
 * call where a late cancel would otherwise still hit D1.
 */
export function makeLlmSignalStep<TWire, TPayload = TWire>(def: LlmSignalStepDef<TWire, TPayload>) {
  return createStep({
    id: def.id,
    inputSchema: PartialBriefStateSchema,
    outputSchema: PartialBriefStateSchema,
    execute: async ({ inputData, requestContext, abortSignal, tracingContext }) => {
      const env = getEnv(requestContext);
      const ctx = getCtx(requestContext);
      abortSignal?.throwIfAborted();
      const caseRow = await loadCaseContext(env, inputData.caseId);
      abortSignal?.throwIfAborted();
      const raw = await runStructuredLlm({
        env,
        ctx,
        stepName: def.id,
        schemaName: def.schemaName,
        modelKind: def.modelKind,
        schema: def.schema,
        system: def.system,
        userPayload: def.buildUserPayload({ caseRow, inputData }),
        abortSignal,
        tracingContext,
      });
      abortSignal?.throwIfAborted();
      const payload = def.postProcess({ raw, caseRow, inputData });
      await def.persist({ env, caseId: inputData.caseId, runId: inputData.runId, payload });
      return def.mergeIntoState(inputData, payload);
    },
  });
}
