import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import type { CloudflareBindings } from "@mizan/shared";
import { resolveLanguageModel } from "../../runtime/model-resolver.ts";
import { buildCopilotInstructions } from "./page-context.ts";

/** Creates the read-only Mizan Copilot agent with caller-supplied tools. */
export function createReviewerCopilotAgent(env: CloudflareBindings, tools: ToolsInput) {
  const resolved = resolveLanguageModel({ kind: "copilot", env });
  return new Agent({
    id: "reviewerCopilot",
    name: "Mizan Copilot",
    instructions: ({ requestContext }) => buildCopilotInstructions(requestContext),
    model: resolved.model,
    tools,
  });
}
