import { createStep } from "@mastra/core/workflows";
import type { z } from "zod";
import type { ModelKind } from "../../models/factory.ts";
import {
  PartialBriefStateSchema,
  type PartialBriefState,
} from "../../schemas/partial-brief-state.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { loadCaseContext, type CaseContext } from "../../runtime/case-loader.ts";
import { runStructuredLlmWithMessages, type StructuredLlmMessage } from "./runStructuredLlm.ts";

export interface ExtractorPrompt {
  readonly system: string;
  readonly messages: ReadonlyArray<StructuredLlmMessage>;
}

export interface ExtractorDef<TOutput> {
  readonly name: string;
  readonly schema: z.ZodType<TOutput>;
  readonly modelKind: ModelKind;
  readonly buildPrompt: (
    caseRow: CaseContext,
    env: ReturnType<typeof getEnv>,
  ) => Promise<ExtractorPrompt>;
  readonly mergeInto: (inputData: PartialBriefState, extracted: TOutput) => PartialBriefState;
}

/**
 * Wraps an extractor as a Mastra step.
 *
 * Errors from the LLM call are wrapped by `runWithErrorContext` in
 * `runStructuredLlm` with the step + schema + provider + model tuple so
 * on-call operators see the failing call site directly. The test-only
 * `MissingMockResponseError` thrown by the mock provider follows the
 * same path — its message is preserved verbatim in the wrapped error's
 * `cause`, so tests asserting on the original message must walk the
 * `cause` chain (e.g. `error.cause instanceof MissingMockResponseError`).
 *
 * The orchestration goes through `runStructuredLlmWithMessages` so
 * every LLM call site in this package — extractors, signal steps,
 * compose, draft — shares one model-resolution / telemetry / retry /
 * parse / error-wrap path.
 */
export function makeExtractor<TOutput>(def: ExtractorDef<TOutput>) {
  return createStep({
    id: def.name,
    inputSchema: PartialBriefStateSchema,
    outputSchema: PartialBriefStateSchema,
    execute: async ({ inputData, requestContext, abortSignal, tracingContext }) => {
      const env = getEnv(requestContext);
      const ctx = getCtx(requestContext);
      abortSignal?.throwIfAborted();
      const caseRow = await loadCaseContext(env, inputData.caseId);
      abortSignal?.throwIfAborted();
      const prompt = await def.buildPrompt(caseRow, env);
      const extracted = await runStructuredLlmWithMessages({
        env,
        ctx,
        stepName: def.name,
        schemaName: `${def.name}.extract`,
        modelKind: def.modelKind,
        schema: def.schema,
        system: prompt.system,
        messages: prompt.messages,
        abortSignal,
        tracingContext,
      });
      abortSignal?.throwIfAborted();
      return def.mergeInto(inputData, extracted);
    },
  });
}
