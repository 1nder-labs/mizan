import { createStep } from "@mastra/core/workflows";
import { DraftedOrganizerMessageSchema, type BriefPayload } from "@mizan/shared";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../../schemas/partial-brief-state.ts";
import { runStructuredLlm } from "../shared/runStructuredLlm.ts";
import { wrapUntrustedData } from "../shared/untrusted-data.ts";
import { updatePersistedBrief } from "../shared/updateBrief.ts";
import { buildDraftPrompt, decideDraftAction } from "./prompt.ts";

/**
 * Drafts a missing-evidence organizer message when composeBrief requested docs.
 *
 * Non-REQUEST_DOCS briefs are skipped (no-op). REQUEST_DOCS briefs invoke a
 * compose-tier LLM call; if generation or persistence fails, the workflow
 * fails the whole run so the queue consumer retries with idempotent state
 * (briefs row already persisted by composeBrief, signals already upserted).
 */
export const draftOrganizerMessage = createStep({
  id: "draftOrganizerMessage",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const decision = decideDraftAction(inputData);
    if (decision.kind === "skip") {
      return inputData;
    }
    const { brief } = decision;
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const { system, userPayload } = buildDraftPrompt({ brief });
    const drafted_organizer_message = await runStructuredLlm({
      env,
      ctx,
      stepName: "draftOrganizerMessage",
      schemaName: "draftOrganizerMessage.draft",
      modelKind: "compose",
      schema: DraftedOrganizerMessageSchema,
      system,
      userPayload: wrapUntrustedData(userPayload),
      abortSignal,
    });
    const updatedBrief: BriefPayload = { ...brief, drafted_organizer_message };
    await updatePersistedBrief({
      env,
      caseId: inputData.caseId,
      runId: inputData.runId,
      brief: updatedBrief,
    });
    return { ...inputData, brief: updatedBrief };
  },
});
