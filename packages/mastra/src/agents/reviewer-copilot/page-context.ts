import type { RequestContext } from "@mastra/core/request-context";
import { SYSTEM_PROMPT } from "./system-prompt.ts";

/**
 * Request-context keys carrying the reviewer's current page so the copilot
 * knows which case is open without scraping it from chat history. Defined once
 * here and imported by the worker that populates the context, so producer and
 * consumer cannot drift.
 */
export const CHAT_CONTEXT_KEYS = { caseId: "caseId", route: "route" } as const;

function readString(requestContext: RequestContext, key: string): string | undefined {
  const value = requestContext.get(key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Appends the open-case context block to the base prompt. With this, "what's
 * missing on this case?" resolves to the case the reviewer is looking at —
 * the model calls get_case with the injected id rather than guessing or
 * reconstructing it from a prior message.
 */
function openCaseBlock(caseId: string, route: string | undefined): string {
  const where = route ? ` (route ${route})` : "";
  return `

CURRENT CONTEXT:
The reviewer is looking at case ${caseId} right now${where}. When they say "this
case", "this campaign", "the case in front of me", or ask a case question
without naming one, they mean THIS case (id ${caseId}).

Call get_case for it ONCE — the first time you need its details. After that, REUSE
the get_case result already in this conversation and answer directly; do NOT call
get_case again for the same case on every follow-up. Re-fetch only if the reviewer
just took an action that may have changed it, or asks about a different case. Carry
this id across the whole conversation; "it" / "the campaign" means the same case
unless the reviewer names another.

If get_case shows the case is still in DRAFT or has no brief yet, do NOT call
get_brief — instead tell the reviewer plainly that the campaign has not been
briefed yet (a reviewer runs Generate-brief), and that once it is briefed you
can surface what the brief flagged as missing. You can still pull the case
details and signals in the meantime.`;
}

/**
 * Dynamic-instructions builder for the reviewer copilot. Reads the open page
 * from the request context the chat route injects per request.
 */
export function buildCopilotInstructions(requestContext: RequestContext | undefined): string {
  if (!requestContext) return SYSTEM_PROMPT;
  const caseId = readString(requestContext, CHAT_CONTEXT_KEYS.caseId);
  if (!caseId) return SYSTEM_PROMPT;
  return SYSTEM_PROMPT + openCaseBlock(caseId, readString(requestContext, CHAT_CONTEXT_KEYS.route));
}
