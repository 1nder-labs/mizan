import { createStep } from "@mastra/core/workflows";
import { generateObject } from "ai";
import { loadCaseContext } from "../runtime/case-loader.ts";
import { getCtx, getEnv } from "../runtime/context-accessors.ts";
import { resolveLanguageModel } from "../runtime/model-resolver.ts";
import { makeTelemetry } from "../runtime/telemetry.ts";
import { PartialBriefStateSchema, StoryCoherencePayloadSchema } from "../schemas/brief.ts";
import { upsertSignal } from "./shared/upsertSignal.ts";

/** Evaluates campaign story coherence via extractor-tier structured output. */
export const storyCoherence = createStep({
  id: "storyCoherence",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const resolved = resolveLanguageModel({ env, kind: "extract" });
    const claims = inputData.extractions?.extractStoryClaims?.claims ?? [];
    const generateArgs = {
      model: resolved.model,
      schema: StoryCoherencePayloadSchema,
      schemaName: "storyCoherence.evaluate",
      system:
        "Evaluate coherence of this campaign story given extracted claims. Output structured fields only.",
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                story: caseRow.story,
                claims,
                category_docs: inputData.extractions?.extractCategoryDocs ?? null,
              }),
            },
          ],
        },
      ],
      maxRetries: 2,
      experimental_telemetry: makeTelemetry({
        stepName: "storyCoherence",
        callPurpose: "extract",
        runtimeContext: ctx,
        provider: resolved.config.provider,
        model: resolved.config.model,
      }),
    };
    const { object: payload } = await generateObject(
      abortSignal ? { ...generateArgs, abortSignal } : generateArgs,
    );
    await upsertSignal(env, inputData.caseId, inputData.runId, "story_coherence", payload);
    return {
      ...inputData,
      signals: { ...inputData.signals, story: payload },
    };
  },
});
