import { createStep } from "@mastra/core/workflows";
import { generateObject } from "ai";
import type { z } from "zod";
import type { ModelConfig, ModelKind } from "../../models/factory.ts";
import type { PartialBriefState } from "../../schemas/brief.ts";
import { PartialBriefStateSchema } from "../../schemas/brief.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { loadCaseContext, type CaseContext } from "../../runtime/case-loader.ts";
import { resolveLanguageModel } from "../../runtime/model-resolver.ts";
import { makeTelemetry } from "../../runtime/telemetry.ts";

export interface ExtractorPrompt {
  readonly system: string;
  readonly messages: Array<{
    role: "user";
    content: Array<
      { type: "text"; text: string } | { type: "image"; image: Uint8Array; mediaType?: string }
    >;
  }>;
}

export interface ExtractorDef<TOutput> {
  readonly name: string;
  readonly schema: z.ZodType<TOutput>;
  readonly modelKind: ModelKind;
  readonly modelOverride?: ModelConfig;
  readonly buildPrompt: (
    caseRow: CaseContext,
    env: ReturnType<typeof getEnv>,
  ) => Promise<ExtractorPrompt>;
  readonly mergeInto: (inputData: PartialBriefState, extracted: TOutput) => PartialBriefState;
}

/**
 * Wraps an extractor as a Mastra step.
 *
 * Errors from `generateObject` propagate unchanged — including the test-only
 * `MissingMockResponseError` thrown by the mock provider. Tests are expected
 * to register canned responses for every extractor a case exercises;
 * silently no-opping on a missing mock would let test outcomes diverge from
 * production behavior, which is exactly the bug class Phase 4's review caught.
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
      const resolved = resolveLanguageModel({
        env,
        kind: def.modelKind,
        ...(def.modelOverride ? { override: def.modelOverride } : {}),
      });
      const schemaName = `${def.name}.extract`;
      const { object } = await generateObject({
        model: resolved.model,
        schema: def.schema,
        schemaName,
        system: prompt.system,
        messages: [...prompt.messages],
        abortSignal,
        maxRetries: 2,
        experimental_telemetry: makeTelemetry({
          stepName: def.name,
          callPurpose: "extract",
          runtimeContext: ctx,
          provider: resolved.config.provider,
          model: resolved.config.model,
        }),
      });
      return def.mergeInto(inputData, object);
    },
  });
}
