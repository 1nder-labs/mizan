import { createStep } from "@mastra/core/workflows";
import { generateObject } from "ai";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { resolveLanguageModel } from "../../runtime/model-resolver.ts";
import { makeTelemetry } from "../../runtime/telemetry.ts";
import { PartialBriefStateSchema } from "../../schemas/brief.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { VouchingChainSchema } from "./schema.ts";

/** Classifies vouching-chain structure via extractor-tier discriminated union output. */
export const classifyVouchingChain = createStep({
  id: "classifyVouchingChain",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const resolved = resolveLanguageModel({ env, kind: "extract" });
    const generateArgs = {
      model: resolved.model,
      schema: VouchingChainSchema,
      schemaName: "classifyVouchingChain.classify",
      system:
        "Classify the accountability chain for this campaign. Choose exactly one structure variant.",
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                story: caseRow.story,
                vouching_narrative: caseRow.vouching_narrative ?? null,
                organizer_name: caseRow.organizer_name,
                geography: caseRow.geography,
              }),
            },
          ],
        },
      ],
      maxRetries: 2,
      experimental_telemetry: makeTelemetry({
        stepName: "classifyVouchingChain",
        callPurpose: "extract",
        runtimeContext: ctx,
        provider: resolved.config.provider,
        model: resolved.config.model,
      }),
    };
    const { object: payload } = await generateObject(
      abortSignal ? { ...generateArgs, abortSignal } : generateArgs,
    );
    await upsertSignal(env, inputData.caseId, inputData.runId, "vouching_chain", payload);
    return {
      ...inputData,
      signals: { ...inputData.signals, vouching: payload },
    };
  },
});
