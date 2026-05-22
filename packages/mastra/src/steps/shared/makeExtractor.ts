import { createStep } from "@mastra/core/workflows";
import { generateObject } from "ai";
import type { z } from "zod";
import type { ModelConfig, ModelKind } from "../../models/factory.ts";
import { getDefaultModel, getModel } from "../../models/factory.ts";
import type { PartialBriefState } from "../../schemas/brief.ts";
import { PartialBriefStateSchema } from "../../schemas/brief.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { loadCaseContext, type CaseContext } from "../../runtime/case-loader.ts";
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
    env: Parameters<typeof getModel>[1],
  ) => Promise<ExtractorPrompt>;
  readonly mergeInto: (inputData: PartialBriefState, extracted: TOutput) => PartialBriefState;
}

/** Higher-order factory for LLM extractor steps — threads abortSignal + telemetry. */
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
      const modelConfig = def.modelOverride ?? getDefaultModel(env, def.modelKind);
      const schemaName = `${def.name}.extract`;
      const { object } = await generateObject({
        model: getModel(modelConfig, env),
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
          provider: modelConfig.provider,
          model: modelConfig.model,
        }),
      });
      return def.mergeInto(inputData, object);
    },
  });
}
