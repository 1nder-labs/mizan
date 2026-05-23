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
 * Errors from `generateObject` propagate unchanged — including the
 * test-only `MissingMockResponseError` thrown by the mock provider.
 * Tests are expected to register canned responses for every extractor a
 * case exercises; silently no-opping on a missing mock would let test
 * outcomes diverge from production behavior, which is exactly the bug
 * class Phase 4's review caught.
 *
 * The orchestration goes through `runStructuredLlmWithMessages` so every
 * LLM call site in this package — extractors, signal steps, compose,
 * draft — shares one model-resolution / telemetry / retry / parse path.
 */
export function makeExtractor<TOutput>(def: ExtractorDef<TOutput>) {
  return createStep({
    id: def.name,
    inputSchema: PartialBriefStateSchema,
    outputSchema: PartialBriefStateSchema,
    execute: async ({ inputData, requestContext, abortSignal }) => {
      const env = getEnv(requestContext);
      const ctx = getCtx(requestContext);
      const caseRow = await loadCaseContext(env, inputData.caseId);
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
      });
      return def.mergeInto(inputData, extracted);
    },
  });
}
