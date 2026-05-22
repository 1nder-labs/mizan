import { createStep } from "@mastra/core/workflows";
import { generateObject } from "ai";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { resolveLanguageModel } from "../../runtime/model-resolver.ts";
import { makeTelemetry } from "../../runtime/telemetry.ts";
import {
  DraftedOrganizerMessageSchema,
  PartialBriefStateSchema,
  type BriefPayload,
} from "../../schemas/brief.ts";
import { updatePersistedBrief } from "../composeBrief/run.ts";
import { buildDraftPrompt } from "./prompt.ts";

/** Drafts a missing-evidence organizer message when composeBrief requested docs. */
export const draftOrganizerMessage = createStep({
  id: "draftOrganizerMessage",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const brief = inputData.brief;
    if (!brief || brief.recommendation !== "REQUEST_DOCS") {
      return inputData;
    }
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const resolved = resolveLanguageModel({ env, kind: "compose" });
    const { system, userPayload } = buildDraftPrompt({ brief });
    const generateArgs = {
      model: resolved.model,
      schema: DraftedOrganizerMessageSchema,
      schemaName: "draftOrganizerMessage.draft",
      system,
      messages: [
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: JSON.stringify(userPayload) }],
        },
      ],
      maxRetries: 2,
      experimental_telemetry: makeTelemetry({
        stepName: "draftOrganizerMessage",
        callPurpose: "compose",
        runtimeContext: ctx,
        provider: resolved.config.provider,
        model: resolved.config.model,
      }),
    };
    const { object: drafted_organizer_message } = await generateObject(
      abortSignal ? { ...generateArgs, abortSignal } : generateArgs,
    );
    const updatedBrief: BriefPayload = { ...brief, drafted_organizer_message };
    await updatePersistedBrief(env, inputData.caseId, inputData.runId, updatedBrief);
    return { ...inputData, brief: updatedBrief };
  },
});
